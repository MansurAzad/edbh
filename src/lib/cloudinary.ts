/**
 * @file cloudinary.ts
 * @description Cloudinary integration helpers used throughout the admin upload pipeline.
 *
 * Upload pipeline overview:
 * ┌──────────────────────────────────────────────────────────────┐
 * │  Browser                                                      │
 * │  File ──► compressImage() ──► uploadProductImage()           │
 * │                                      │                        │
 * │                         ┌────────────┴────────────┐           │
 * │                         ▼                         ▼           │
 * │              Supabase Storage          uploadToCloudinary()   │
 * │              (primary CDN URL)         (mirror / edge cache) │
 * └──────────────────────────────────────────────────────────────┘
 *
 * All network calls go through the Supabase Edge Function proxy so that
 * Cloudinary credentials are never exposed to the browser.
 *
 * Edge functions involved:
 *  - `cloudinary-upload`  — accepts multipart FormData; returns CloudinaryUploadResult
 *  - `cloudinary-migrate` — server-side batch migration of existing Storage URLs
 */
import { supabase } from "@/integrations/supabase/client";

/**
 * Shape returned by the `cloudinary-upload` edge function.
 *
 * - `success`   – true when the upload (or de-dup hit) succeeded.
 * - `url`       – delivery URL (res.cloudinary.com). Present on success.
 * - `public_id` – Cloudinary public ID; useful for later transforms or deletes.
 * - `existing`  – true when Cloudinary detected the file was already uploaded
 *                 (hash de-dup). The same `url` is returned so callers can
 *                 treat this identically to a fresh upload.
 * - `error`     – human-readable message when `success` is false.
 */
interface CloudinaryUploadResult {
  success: boolean;
  url?: string;
  public_id?: string;
  existing?: boolean;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// URL transform helper. Inserts Cloudinary format/quality/width transforms into
// an existing delivery URL. No-op for non-Cloudinary URLs so it's safe to wrap
// every <img src>.
//
// Example:
//   buildCloudinaryUrl("https://res.cloudinary.com/x/image/upload/v1/abc.jpg", { width: 600 })
//   → "https://res.cloudinary.com/x/image/upload/f_auto,q_auto,dpr_auto,w_600/v1/abc.jpg"
//
// Cross-module assumption: callers must NOT double-wrap; this function detects
// an existing transform block and returns `src` unchanged in that case.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Optional parameters controlling the on-the-fly Cloudinary transformation
 * injected by {@link buildCloudinaryUrl}.
 */
export interface CldOpts {
  /** Pixel width to request (`w_N`). Rounded to the nearest integer. */
  width?: number;
  /** Pixel height to request (`h_N`). Rounded to the nearest integer. */
  height?: number;
  /**
   * When `true` (default), prepend `f_auto,q_auto,dpr_auto` so Cloudinary
   * selects the best format (WebP/AVIF) and quality for each browser.
   * Set to `false` for raw-format URLs (e.g. PDF previews).
   */
  auto?: boolean;
}

/**
 * Injects Cloudinary URL transformation parameters into an existing delivery URL.
 *
 * Safe to call on any URL — returns the original string unchanged for:
 *  - Empty / nullish values
 *  - Non-Cloudinary URLs
 *  - URLs that already contain a transformation block
 *
 * @param src  - The original image URL (may or may not be a Cloudinary URL).
 * @param opts - Transform options; all keys are optional.
 * @returns    The transformed Cloudinary URL, or `src` unchanged if no-op.
 *
 * @example
 * // With auto transforms + a width cap:
 * buildCloudinaryUrl(url, { width: 800 });
 * // → "https://res.cloudinary.com/.../upload/f_auto,q_auto,dpr_auto,w_800/..."
 *
 * @example
 * // Suppress auto, only request height:
 * buildCloudinaryUrl(url, { auto: false, height: 400 });
 * // → "https://res.cloudinary.com/.../upload/h_400/..."
 */
export function buildCloudinaryUrl(src: string, opts: CldOpts = {}): string {
  if (!src || !src.includes("res.cloudinary.com") || !src.includes("/upload/")) return src;
  // Don't double-transform — if a transform block already exists right after
  // /upload/, leave the URL alone.
  const [base, after] = src.split("/upload/");
  if (!after) return src;
  // Detect existing transform block (anything other than v\d+/ or the asset path).
  const firstSegment = after.split("/")[0];
  if (/^(f_|q_|w_|h_|c_|dpr_|e_|l_|t_)/.test(firstSegment)) return src;

  const parts: string[] = [];
  if (opts.auto !== false) parts.push("f_auto", "q_auto", "dpr_auto");
  if (opts.width) parts.push(`w_${Math.round(opts.width)}`);
  if (opts.height) parts.push(`h_${Math.round(opts.height)}`);
  if (parts.length === 0) return src;
  return `${base}/upload/${parts.join(",")}/${after}`;
}


/**
 * Uploads a browser `File` object to Cloudinary via the `cloudinary-upload`
 * Supabase Edge Function.
 *
 * The file is sent as multipart FormData so the edge function can stream it
 * directly to Cloudinary without base64 overhead.
 *
 * **Authentication**: The edge function uses server-side Cloudinary API keys;
 * no credentials are transmitted from the browser.
 *
 * **Error handling**: Network or edge-function errors are caught and surfaced
 * as `{ success: false, error: message }` — callers should check `success`
 * before reading `url`. Throws are NOT expected from this function; prefer
 * the `error` field.
 *
 * @param file         - The `File` (or `Blob`) to upload.
 * @param folder       - Cloudinary folder path (default `"products"`).
 * @param resourceType - Cloudinary resource type: `"image"` | `"video"` | `"raw"` (default `"image"`).
 * @returns            Promise resolving to a {@link CloudinaryUploadResult}.
 *
 * @see uploadUrlToCloudinary for URL-based uploads (e.g. migration from Supabase Storage)
 */
export async function uploadToCloudinary(
  file: File,
  folder: string = "products",
  resourceType: string = "image"
): Promise<CloudinaryUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);
  formData.append("resource_type", resourceType);

  const { data, error } = await supabase.functions.invoke("cloudinary-upload", {
    body: formData,
  });

  if (error) {
    // Supabase wraps HTTP / network errors in a FunctionsHttpError or FunctionsRelayError.
    // We surface the message but do NOT throw, keeping the return type consistent.
    return { success: false, error: error.message };
  }

  return data as CloudinaryUploadResult;
}

/**
 * Uploads an image (or other resource) to Cloudinary by passing a **remote URL**
 * rather than raw bytes. The edge function fetches the URL server-side and
 * forwards it to Cloudinary's URL-upload API.
 *
 * Typical use-case: migrating existing Supabase Storage public URLs to Cloudinary
 * without re-downloading the file to the browser.
 *
 * **Deduplication**: Cloudinary performs SHA-1 hashing on the fetched resource.
 * If the identical file was previously uploaded the response will include
 * `existing: true` along with the original `url` and `public_id`.
 *
 * @param fileUrl      - Publicly accessible URL of the resource to fetch.
 * @param folder       - Cloudinary folder path (default `"products"`).
 * @param resourceType - Cloudinary resource type (default `"image"`).
 * @returns            Promise resolving to a {@link CloudinaryUploadResult}.
 */
export async function uploadUrlToCloudinary(
  fileUrl: string,
  folder: string = "products",
  resourceType: string = "image"
): Promise<CloudinaryUploadResult> {
  const formData = new FormData();
  // Edge function distinguishes file-binary vs URL uploads via this field name.
  formData.append("file_url", fileUrl);
  formData.append("folder", folder);
  formData.append("resource_type", resourceType);

  const { data, error } = await supabase.functions.invoke("cloudinary-upload", {
    body: formData,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return data as CloudinaryUploadResult;
}

/**
 * Triggers a server-side batch migration of all existing Supabase Storage
 * product images to Cloudinary via the `cloudinary-migrate` edge function.
 *
 * **When to call**: Run once (or on-demand from the admin Cloudinary panel)
 * after enabling Cloudinary for the first time. The function is idempotent —
 * already-migrated assets are skipped via `existing: true` de-dup.
 *
 * **Error handling**: Throws a plain `Error` with the edge-function message on
 * failure. Callers should wrap in try/catch and display the error to admins.
 *
 * @returns Raw response data from the `cloudinary-migrate` edge function.
 *          Shape is implementation-defined by that function; inspect in the
 *          Supabase Functions dashboard for the exact migration report.
 * @throws  {Error} If the edge function returns an error status.
 */
export async function migrateToCloudinary(): Promise<any> {
  const { data, error } = await supabase.functions.invoke("cloudinary-migrate");

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
