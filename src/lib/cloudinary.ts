import { supabase } from "@/integrations/supabase/client";

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
// ─────────────────────────────────────────────────────────────────────────────
export interface CldOpts {
  width?: number;
  height?: number;
  /** When true (default), inject f_auto,q_auto,dpr_auto. */
  auto?: boolean;
}

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
    return { success: false, error: error.message };
  }

  return data as CloudinaryUploadResult;
}

export async function uploadUrlToCloudinary(
  fileUrl: string,
  folder: string = "products",
  resourceType: string = "image"
): Promise<CloudinaryUploadResult> {
  const formData = new FormData();
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

export async function migrateToCloudinary(): Promise<any> {
  const { data, error } = await supabase.functions.invoke("cloudinary-migrate");

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
