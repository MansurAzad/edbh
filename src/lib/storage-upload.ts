/**
 * @file storage-upload.ts
 * @module lib/storage-upload
 *
 * **Dual-destination image upload with automatic compression and real-time
 * progress events.**
 *
 * ## Upload pipeline
 *
 * ```
 * Input File
 *   │
 *   ▼ Stage 1 — compress  (0 → 25 %)
 *   compressImage() → target ≤ 256 KB by default
 *   │
 *   ▼ Stage 2 — supabase  (25 → 70 %)
 *   supabase.storage.from(bucket).upload(storagePath)
 *   Returns the canonical public URL used as `DualUploadResult.url`
 *   │
 *   ▼ Stage 3 — cloudinary (70 → 100 %)
 *   uploadToCloudinary() — **non-blocking**, failure = fallback to Supabase URL
 *   │
 *   ▼ Stage 4 — done (100 %)
 * ```
 *
 * ## Error philosophy
 * - **Supabase failure** → hard error; the upload is aborted and
 *   `DualUploadResult.success` is `false`.
 * - **Cloudinary failure** → soft error; the upload still succeeds and
 *   `DualUploadResult.url` points to the Supabase public URL.  The failure is
 *   logged to `localStorage` (capped at 20 entries) so the admin panel can
 *   surface Cloudinary health without crashing the upload flow.
 * - **Compression failure** → soft error; the original file is used instead of
 *   the compressed one and a warning is logged.
 *
 * ## Storage path format
 * ```
 * {folder}/{safeBaseName}-{timestamp}-{6-char random}.{ext}
 * ```
 * The unique suffix prevents Supabase Storage from colliding on identical
 * file names and makes URL-guessing marginally harder.
 *
 * ## Bengali UI strings
 * Progress messages use Bengali (বাংলা) because they are displayed directly in
 * the admin upload UI.  English inline comments explain the intent.
 *
 * @example
 * const result = await uploadProductImage(file, {
 *   folder: "products",
 *   onProgress: (e) => console.log(e.stage, e.progress, e.message),
 *   skipCloudinary: false,
 *   targetBytes: 256 * 1024,
 * });
 * if (result.success) console.log(result.url); // Supabase public URL (primary)
 */

import { supabase } from "@/integrations/supabase/client";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { compressImage, formatBytes } from "@/lib/image-compress";

// ─── Cloudinary failure log ───────────────────────────────────────────────────

/**
 * `localStorage` key under which recent Cloudinary upload failures are stored.
 * Entries are prepended and the array is capped at 20 to prevent unbounded
 * storage growth.  Cleared via `clearCloudinaryFailures()`.
 */
const CLOUDINARY_LOG_KEY = "cloudinary_recent_failures";

/**
 * Appends a Cloudinary failure entry to the localStorage audit log.
 * Silent no-op if `localStorage` is unavailable.
 *
 * @param message - Human-readable description of what went wrong.
 * @param reason  - Optional machine tag indicating the failure category
 *   (e.g. `"exception"`, `"api_error"`).
 *
 * @remarks
 * Entries are stored as `{ at: ISO8601, message, reason }` objects, prepended
 * so the most recent failure is always at index 0.  The array is sliced to 20
 * to keep storage usage negligible.
 */
function logCloudinaryFailure(message: string, reason?: string) {
  try {
    const raw = localStorage.getItem(CLOUDINARY_LOG_KEY);
    const arr: Array<{ at: string; message: string; reason?: string }> = raw
      ? JSON.parse(raw)
      : [];
    // Prepend the new entry so index 0 is always the most recent failure.
    arr.unshift({ at: new Date().toISOString(), message, reason });
    // Cap at 20 entries to avoid unbounded localStorage growth.
    localStorage.setItem(CLOUDINARY_LOG_KEY, JSON.stringify(arr.slice(0, 20)));
  } catch {
    /* localStorage unavailable — swallow silently */
  }
}

/**
 * Returns the last ≤ 20 Cloudinary upload failures recorded on this device.
 * Used by the admin panel to surface Cloudinary health status.
 *
 * @returns Array of failure records ordered newest-first, or `[]` if none.
 */
export function getCloudinaryRecentFailures(): Array<{
  at: string;
  message: string;
  reason?: string;
}> {
  try {
    const raw = localStorage.getItem(CLOUDINARY_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Removes all stored Cloudinary failure entries from `localStorage`.
 * Useful after the admin panel has acknowledged the failures.
 */
export function clearCloudinaryFailures() {
  try {
    localStorage.removeItem(CLOUDINARY_LOG_KEY);
  } catch {
    /* localStorage unavailable — swallow silently */
  }
}

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Describes the outcome of a `uploadProductImage()` call.
 *
 * On success (`success: true`):
 * - `url` — the **primary** public URL (Supabase Storage).  Always present.
 * - `cloudinaryUrl` — the Cloudinary CDN URL.  Present only if mirroring
 *   succeeded; undefined if `skipCloudinary` was `true` or Cloudinary failed.
 * - `storagePath` — the relative path within the Supabase bucket, e.g.
 *   `"products/cotton-saree-1715000000000-abc123.jpg"`.  Required for
 *   subsequent `supabase.storage.from(bucket).remove([storagePath])` calls.
 *
 * On failure (`success: false`):
 * - `error` — human-readable message.
 *
 * `cloudinaryError` may be set even when `success: true` (Cloudinary soft
 * failure with Supabase fallback active).
 */
export interface DualUploadResult {
  /** `true` if the Supabase upload succeeded (the minimum requirement). */
  success: boolean;
  /**
   * Primary public URL from Supabase Storage.
   * Use this as the canonical `image_url` in the database.
   */
  url?: string;
  /**
   * Relative path inside the Supabase bucket.
   * Store this alongside `url` if you need to delete the file later.
   */
  storagePath?: string;
  /**
   * Cloudinary CDN URL.  Prefer this over `url` in `<img>` tags for
   * on-the-fly transformations (resize, format conversion, etc.).
   * `undefined` if Cloudinary mirroring was skipped or failed.
   */
  cloudinaryUrl?: string;
  /**
   * Error message from the Cloudinary upload, if any.
   * Present alongside `success: true` when fallback is active.
   */
  cloudinaryError?: string;
  /**
   * Human-readable error message for hard failures (Supabase upload error,
   * MIME type rejection, size limit exceeded).
   */
  error?: string;
  /** Original file size in bytes, before compression. */
  originalSize?: number;
  /** Final file size in bytes after compression (≤ `originalSize`). */
  finalSize?: number;
}

/**
 * Upload pipeline stage discriminant.
 *
 * | Value       | Meaning                                     |
 * |-------------|---------------------------------------------|
 * | `compress`  | Image compression in progress or complete.  |
 * | `supabase`  | Uploading to Supabase Storage.              |
 * | `cloudinary`| Mirroring to Cloudinary.                    |
 * | `done`      | All stages complete, result is ready.       |
 * | `error`     | A hard error stopped the pipeline.          |
 */
export type UploadStage =
  | "compress"
  | "supabase"
  | "cloudinary"
  | "done"
  | "error";

/**
 * Progress notification emitted at each milestone.
 * Attach a `ProgressCallback` to `UploadOptions.onProgress` to stream these
 * into a progress bar or status text.
 */
export interface ProgressEvent {
  /** Current stage of the upload pipeline. */
  stage: UploadStage;
  /**
   * Overall upload progress as an integer 0–100.
   * Approximate checkpoints:
   *  - Compression start:  5
   *  - Compression done:  25
   *  - Supabase start:    35
   *  - Supabase done:     70
   *  - Cloudinary start:  80
   *  - Cloudinary done:  100
   */
  progress: number; // 0-100 overall
  /**
   * Short Bengali UI message suitable for display in a toast or status bar.
   * (বাংলা / Bengali: the primary language of the admin interface)
   */
  message?: string;
  /**
   * Optional technical detail string (e.g. compression ratio, error message).
   * Not shown in the main UI but useful for debug overlays.
   */
  detail?: string;
}

/** Callback type for streaming upload progress events. */
export type ProgressCallback = (e: ProgressEvent) => void;

/**
 * Configuration options for `uploadProductImage()`.
 *
 * @remarks
 * The function also accepts a plain `string` as the first argument for
 * backwards-compatibility (interpreted as `folder`).
 */
interface UploadOptions {
  /**
   * Supabase Storage folder prefix, e.g. `"products"` or `"banners"`.
   * Defaults to `"products"`.
   */
  folder?: string;
  /**
   * Supabase Storage bucket name.
   * Defaults to `"product-images"`.
   */
  bucket?: string;
  /**
   * Optional progress callback invoked at each pipeline milestone.
   * Receives a `ProgressEvent`; returning `void`.
   */
  onProgress?: ProgressCallback;
  /**
   * When `true`, skip the Cloudinary mirroring step entirely.
   * Use this for uploads where CDN transformations are not needed (e.g.
   * internal admin assets) or when debugging Supabase-only flows.
   */
  skipCloudinary?: boolean;
  /**
   * Target file size in bytes after compression.
   * Defaults to 256 KB (262 144 bytes).
   * The compressor makes a best-effort attempt; very small or already-
   * compressed images may not reach the target.
   */
  targetBytes?: number;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compresses an image file and uploads it to both Supabase Storage and
 * Cloudinary, emitting real-time progress events along the way.
 *
 * **Validation rules (checked before any network call):**
 * - MIME type must start with `"image/"`.
 * - File must be ≤ 20 MB (before compression).
 *
 * **Storage path format:**
 * `{folder}/{safeBaseName}-{timestamp}-{6-char random}.{ext}`
 *
 * @param file          - The `File` object selected by the user.
 * @param folderOrOpts  - Either a folder string (`"products"`) for back-compat
 *                        **or** an `UploadOptions` object.  Defaults to
 *                        `"products"` when omitted.
 * @param bucketArg     - Supabase Storage bucket name.  Only used when
 *                        `folderOrOpts` is a string (legacy call signature).
 *                        Ignored when `folderOrOpts` is an `UploadOptions`
 *                        object (use `opts.bucket` instead).
 * @returns A `DualUploadResult` — always resolves, never rejects.
 *
 * @throws Never — all errors are caught and returned in `DualUploadResult`.
 *
 * @example
 * // Modern call with options object:
 * const result = await uploadProductImage(file, {
 *   folder: "banners",
 *   bucket: "product-images",
 *   skipCloudinary: true,
 *   onProgress: ({ stage, progress, message }) =>
 *     setStatus(`${stage} ${progress}% — ${message}`),
 * });
 *
 * @example
 * // Legacy call (folder string):
 * const result = await uploadProductImage(file, "products");
 */
export async function uploadProductImage(
  file: File,
  folderOrOpts: string | UploadOptions = "products",
  bucketArg: string = "product-images"
): Promise<DualUploadResult> {
  // Normalise the overloaded second parameter into a unified options object.
  const opts: UploadOptions =
    typeof folderOrOpts === "string"
      ? { folder: folderOrOpts, bucket: bucketArg }
      : { bucket: bucketArg, ...folderOrOpts };

  const folder = opts.folder ?? "products";
  const bucket = opts.bucket ?? "product-images";
  // Use a no-op emitter if the caller did not provide a progress callback.
  const emit = opts.onProgress ?? (() => {});

  // ── Input validation ──────────────────────────────────────────────────────

  // Reject non-image MIME types immediately — do not waste a network call.
  if (!file.type.startsWith("image/")) {
    emit({ stage: "error", progress: 0, message: "Only image files are allowed" });
    return { success: false, error: "Only image files are allowed" };
  }

  // Guard against excessively large uploads (20 MB raw).
  // The compressor runs after this check, so 20 MB is the *pre-compression* cap.
  if (file.size > 20 * 1024 * 1024) {
    emit({ stage: "error", progress: 0, message: "Image must be less than 20MB" });
    return { success: false, error: "Image must be less than 20MB" };
  }

  // ── Stage 1: Compression ─────────────────────────────────────────────────

  emit({ stage: "compress", progress: 5, message: "ছবি কম্প্রেস হচ্ছে…" }); // "Image compressing…"
  let workingFile = file;        // Will hold the compressed file (or original on failure)
  let compressReport = "";       // Human-readable "123 KB → 45 KB" summary

  try {
    const r = await compressImage(file, { targetBytes: opts.targetBytes ?? 256 * 1024 });
    workingFile = r.file;
    compressReport = `${formatBytes(r.originalSize)} → ${formatBytes(r.finalSize)}`;
    emit({
      stage: "compress",
      progress: 25,
      message: "কম্প্রেশন সম্পন্ন", // "Compression complete"
      detail: compressReport,
    });
  } catch (err: any) {
    // Compression failure is non-fatal: upload the original file.
    console.warn("[storage-upload] compression failed, uploading original:", err);
    emit({
      stage: "compress",
      progress: 25,
      message: "কম্প্রেশন স্কিপ হয়েছে", // "Compression skipped"
      detail: err?.message,
    });
  }

  // ── Stage 2: Build deterministic storage path ─────────────────────────────

  // Sanitise extension — remove anything that isn't alphanumeric.
  const ext = (workingFile.name.split(".").pop() || "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  // Sanitise the base name: lowercase, replace non-alphanumeric runs with "-",
  // strip leading/trailing dashes, cap at 40 chars.
  const safeBase =
    file.name
      .replace(/\.[^/.]+$/, "")   // strip original extension
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image";

  // Unique suffix prevents collisions for identical file names.
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const storagePath = `${folder}/${safeBase}-${unique}.${ext}`;

  // ── Stage 3: Upload to Supabase Storage ───────────────────────────────────

  emit({ stage: "supabase", progress: 35, message: "Lovable Cloud-এ আপলোড হচ্ছে…" }); // "Uploading to Lovable Cloud…"

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(storagePath, workingFile, {
      cacheControl: "31536000", // 1 year — images are immutable (new name = new version)
      upsert: false,            // Reject if the path already exists (shouldn't happen with unique suffix)
      contentType: workingFile.type || file.type,
    });

  // Supabase failure is a HARD error — no fallback, return immediately.
  if (upErr) {
    emit({
      stage: "error",
      progress: 35,
      message: "Supabase আপলোড ব্যর্থ", // "Supabase upload failed"
      detail: upErr.message,
    });
    return { success: false, error: `Storage upload failed: ${upErr.message}` };
  }

  // Derive the public URL from the just-uploaded path.
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  const primaryUrl = pub.publicUrl;
  emit({
    stage: "supabase",
    progress: 70,
    message: "Lovable Cloud ✓",
    detail: compressReport,
  });

  // ── Stage 4: Cloudinary mirror (soft, non-blocking) ───────────────────────

  let cloudinaryUrl: string | undefined;
  let cloudinaryError: string | undefined;

  if (!opts.skipCloudinary) {
    emit({ stage: "cloudinary", progress: 80, message: "Cloudinary mirror চলছে…" }); // "Cloudinary mirror running…"
    try {
      const mirror = await uploadToCloudinary(workingFile, folder);
      if (mirror.success && mirror.url) {
        // Mirror succeeded — Cloudinary CDN URL is available.
        cloudinaryUrl = mirror.url;
        emit({ stage: "cloudinary", progress: 100, message: "Cloudinary mirror ✓" });
      } else {
        // Mirror returned an error response (not an exception).
        cloudinaryError = mirror.error || "Unknown Cloudinary error";
        logCloudinaryFailure(cloudinaryError, (mirror as any).reason);
        console.warn(
          "[storage-upload] Cloudinary mirror failed — fallback to Lovable Cloud URL:",
          cloudinaryError
        );
        emit({
          stage: "cloudinary",
          progress: 100,
          message: "Cloudinary mirror ব্যর্থ — Lovable Cloud fallback সক্রিয়", // "Cloudinary mirror failed — fallback active"
          detail: cloudinaryError,
        });
      }
    } catch (err: any) {
      // Unexpected exception (network timeout, JSON parse error, etc.).
      cloudinaryError = err?.message || String(err);
      logCloudinaryFailure(cloudinaryError, "exception");
      console.warn(
        "[storage-upload] Cloudinary mirror exception — fallback to Lovable Cloud URL:",
        cloudinaryError
      );
      emit({
        stage: "cloudinary",
        progress: 100,
        message: "Cloudinary mirror ব্যর্থ — Lovable Cloud fallback সক্রিয়", // "Cloudinary mirror failed — fallback active"
        detail: cloudinaryError,
      });
    }
  } else {
    // Caller explicitly opted out of Cloudinary mirroring.
    emit({ stage: "cloudinary", progress: 100, message: "Cloudinary mirror স্কিপ" }); // "Cloudinary mirror skipped"
  }

  // Emit final completion event.
  emit({ stage: "done", progress: 100, message: "সম্পন্ন" }); // "Complete"

  return {
    success: true,
    url: primaryUrl,       // Primary / canonical URL (Supabase Storage CDN)
    storagePath,           // Relative path for future delete/update operations
    cloudinaryUrl,         // Cloudinary CDN URL (undefined if mirroring was skipped/failed)
    cloudinaryError,       // Set if Cloudinary failed but Supabase succeeded
    originalSize: file.size,        // Pre-compression bytes
    finalSize: workingFile.size,    // Post-compression bytes (same if compression skipped)
  };
}
