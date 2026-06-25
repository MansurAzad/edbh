/**
 * @file image-compress.ts
 * @description Client-side image compression and resizing using the Canvas API.
 *
 * Strategy:
 *  1. Decode the file into an `HTMLImageElement`.
 *  2. Draw it onto an off-screen `<canvas>` at the target dimensions.
 *  3. Encode to WebP (or JPEG as fallback) at decreasing quality steps until
 *     the blob fits within `targetBytes`.
 *  4. If quality alone is not enough, shrink the canvas by 20 % and retry.
 *  5. If the compressed result is *larger* than the original, return the
 *     original `File` unchanged (safety net).
 *
 * Skipped for: GIF (animated frames would be lost) and SVG (vector, lossless).
 *
 * Cross-module assumption:
 *  `storage-upload.ts` calls this before the Supabase Storage upload so that
 *  the compressed file — not the raw browser file — is stored and mirrored to
 *  Cloudinary. The `CompressResult.file` field is always the correct file to
 *  pass downstream.
 *
 * Environment requirement: Must run in a browser context with `document`,
 * `HTMLCanvasElement`, and `URL.createObjectURL` available.
 */

/**
 * Options controlling the compression algorithm.
 */
export interface CompressOptions {
  /**
   * Target file size ceiling in bytes.
   * The compressor will iterate until the output is ≤ this value, or until 8
   * attempts are exhausted.
   * @default 256 * 1024  (256 KB)
   */
  targetBytes?: number;
  /**
   * Maximum pixel width OR height allowed before downscaling.
   * Aspect ratio is preserved.
   * @default 1920
   */
  maxDimension?: number;
  /**
   * Preferred output MIME type.
   * Falls back to `"image/jpeg"` when the browser rejects WebP encoding (e.g.
   * some older Safari releases or when `toBlob` silently returns a PNG).
   * @default "image/webp"
   */
  mimeType?: string;
}

/**
 * Detailed result returned by {@link compressImage}.
 */
export interface CompressResult {
  /**
   * The compressed `File` object ready to upload.
   * If compression was skipped or would inflate the file, this is the *original*
   * input `File` unchanged.
   */
  file: File;
  /** Size of the original input file in bytes. */
  originalSize: number;
  /** Size of the output `file` in bytes. */
  finalSize: number;
  /** Pixel width of the output canvas (0 if compression was skipped). */
  width: number;
  /** Pixel height of the output canvas (0 if compression was skipped). */
  height: number;
  /** Number of encode iterations performed (0 if compression was skipped). */
  attempts: number;
}

/**
 * Creates a temporary object URL, loads it into an `HTMLImageElement`, then
 * revokes the URL to free memory.
 *
 * @param file - The image file to decode.
 * @returns    A resolved `HTMLImageElement` with `naturalWidth`/`naturalHeight`.
 * @throws     Rejects if the browser cannot decode the file format.
 * @internal
 */
const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });

/**
 * Promisified wrapper around `HTMLCanvasElement.toBlob`.
 *
 * @param canvas  - Source canvas.
 * @param type    - MIME type (`"image/webp"` or `"image/jpeg"`).
 * @param quality - Encode quality in [0, 1].
 * @returns       The encoded `Blob`, or `null` if encoding failed.
 * @internal
 */
const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Compresses a browser `File` to fit within a byte budget using an iterative
 * quality-reduction and downscale strategy.
 *
 * **Iteration algorithm** (up to 8 rounds):
 *  - If `quality > 0.45`: reduce quality by 0.12.
 *  - Once quality ≤ 0.45: shrink canvas to 80 % of current long-edge, reset
 *    quality to 0.70, and try again.
 *
 * **GIF / SVG**: returned immediately without modification since re-encoding
 * would destroy animation or vector fidelity.
 *
 * **Already small**: if `file.size ≤ targetBytes` the original is returned
 * immediately (0 attempts, dimensions reported as 0).
 *
 * @param file - Source image `File` from a file picker or drag-and-drop.
 * @param opts - Optional compression tuning.
 * @returns    A {@link CompressResult} containing the output file and metrics.
 *
 * @example
 * const { file: compressed, originalSize, finalSize } = await compressImage(rawFile);
 * console.log(`${formatBytes(originalSize)} → ${formatBytes(finalSize)}`);
 */
export async function compressImage(
  file: File,
  opts: CompressOptions = {}
): Promise<CompressResult> {
  const targetBytes = opts.targetBytes ?? 256 * 1024;
  let maxDim = opts.maxDimension ?? 1920;
  const preferredType = opts.mimeType ?? "image/webp";

  // GIFs (animated) and SVG should not be re-encoded
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return { file, originalSize: file.size, finalSize: file.size, width: 0, height: 0, attempts: 0 };
  }

  // Already small enough — skip all canvas work
  if (file.size <= targetBytes) {
    return { file, originalSize: file.size, finalSize: file.size, width: 0, height: 0, attempts: 0 };
  }

  const img = await loadImage(file);
  let { width, height } = img;

  /**
   * Mutates `width` and `height` in place so the long edge does not exceed
   * `maxDim`, preserving the original aspect ratio.
   */
  const scaleToFit = () => {
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
  };
  scaleToFit();

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  // If 2D context is unavailable (e.g. too many active canvases), bail out.
  if (!ctx) return { file, originalSize: file.size, finalSize: file.size, width, height, attempts: 0 };

  let quality = 0.82; // Starting JPEG/WebP quality (empirically chosen for good results)
  let attempts = 0;
  let best: Blob | null = null;

  // Up to 8 iterations: drop quality, then downscale if still too big
  while (attempts < 8) {
    attempts++;
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    let blob = await canvasToBlob(canvas, preferredType, quality);
    // Some browsers refuse webp encoding — toBlob returns a PNG instead.
    // Detect this by checking blob.type and fall back to JPEG.
    if (!blob || blob.type === "image/png") {
      blob = await canvasToBlob(canvas, "image/jpeg", quality);
    }
    if (!blob) break;

    // Track the smallest blob seen across all attempts
    if (!best || blob.size < best.size) best = blob;

    // Stop as soon as we're under budget
    if (blob.size <= targetBytes) break;

    // Strategy: first lower quality, then shrink canvas dimensions
    if (quality > 0.45) {
      quality -= 0.12;
    } else {
      // Quality bottomed out — downscale by 20 % and retry at a higher quality
      maxDim = Math.round(Math.max(width, height) * 0.8);
      scaleToFit();
      quality = 0.7;
    }
  }

  // Safety net: if compression made the file larger, return the original
  if (!best || best.size >= file.size) {
    return { file, originalSize: file.size, finalSize: file.size, width, height, attempts };
  }

  // Build a proper File so downstream code gets correct `.name` and `.type`
  const ext = best.type === "image/webp" ? "webp" : "jpg";
  const baseName = file.name.replace(/\.[^/.]+$/, ""); // strip original extension
  const compressed = new File([best], `${baseName}.${ext}`, {
    type: best.type,
    lastModified: Date.now(),
  });

  return {
    file: compressed,
    originalSize: file.size,
    finalSize: compressed.size,
    width,
    height,
    attempts,
  };
}

/**
 * Formats a raw byte count as a human-readable string.
 *
 * Thresholds:
 *  - `< 1 024`       → `"N B"`
 *  - `< 1 048 576`   → `"N KB"` (integer)
 *  - `≥ 1 048 576`   → `"N.NN MB"` (2 decimals)
 *
 * Used in progress messages shown to admins during image upload.
 *
 * @param b - Byte count (non-negative integer).
 * @returns  Formatted string, e.g. `"48 KB"` or `"1.23 MB"`.
 */
export const formatBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(2)} MB`;
