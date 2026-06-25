/**
 * @file InlineImageUpload.tsx
 * @description Compact inline image picker used inside ProductRowCard for both
 * product-level and variant-level images.  Supports two input modes:
 *   1. **File upload** → Cloudinary (via `uploadToCloudinary`).
 *   2. **Direct URL** → any CDN/Cloudinary URL typed or pasted by the admin.
 *
 * ── Cloudinary upload flow ────────────────────────────────────────────────────
 *
 * 1. Admin clicks the dashed-border image placeholder button.
 * 2. The hidden `<input type="file" accept="image/*">` is triggered via ref.
 * 3. `upload(file)` is called on file selection:
 *    a. Guard: reject non-image MIME types → Bengali toast "ইমেজ ফাইল দিন".
 *    b. Guard: reject files over 5 MB → Bengali toast "সর্বোচ্চ 5MB".
 *    c. `setUploading(true)` → spinner replaces the image icon in the button.
 *    d. `uploadToCloudinary(file, "products")` is imported **lazily** via a
 *       dynamic `import()` to avoid bundling Cloudinary SDK into the initial
 *       chunk.  The "products" string is the Cloudinary upload preset/folder.
 *    e. On `result.success === false`: show `result.error` toast, set uploading
 *       false, and return early — `onChange` is NOT called, preserving the
 *       previous value.
 *    f. On success: call `onChange(result.url!)` to update the parent's field.
 * 4. `setUploading(false)` is called after the try/catch in both paths.
 *    Note: currently NOT in a `finally` block — if `uploadToCloudinary` throws
 *    after setting `uploading = false` in the error branch, the spinner may
 *    stay visible.  This is an acceptable UX trade-off for the admin panel.
 *
 * ── URL input mode ────────────────────────────────────────────────────────────
 *
 * Clicking the small "URL" text button sets `showUrlInput = true`, which swaps
 * the upload placeholder for a text input + confirm/cancel buttons.
 * `applyUrl()` trims the URL, calls `onChange`, and hides the input.
 * Pressing Enter also calls `applyUrl()` via `onKeyDown`.
 * No URL validation is performed — the admin is trusted to provide valid URLs.
 *
 * ── Image preview & removal ───────────────────────────────────────────────────
 *
 * When `value` is a non-empty string, an `<img>` thumbnail (40×40 px) is shown.
 * Hovering the thumbnail reveals an "×" button overlay in the top-right corner
 * that calls `onChange("")` to clear the image URL.
 *
 * ── Input reset guard ─────────────────────────────────────────────────────────
 *
 * After file selection: `e.target.value = ""` resets the hidden input so the
 * same file can be re-selected (the browser skips `onChange` if the value
 * doesn't change).
 *
 * ── Bengali UI strings ────────────────────────────────────────────────────────
 * • "ইমেজ ফাইল দিন"  → non-image MIME type rejection toast
 * • "সর্বোচ্চ 5MB"    → file size limit rejection toast
 * • "URL দিন"         → tooltip on the URL text button (title attr)
 * • "ফাইল আপলোড"      → tooltip on the upload placeholder button (title attr)
 *
 * @module InlineImageUpload
 */

import { useRef, useState } from "react";
import { Loader2, Image as ImageIcon, CheckCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for {@link InlineImageUpload}.
 */
interface Props {
  /**
   * Current image URL value.  Empty string = no image.
   * When non-empty, a thumbnail preview is rendered.
   */
  value: string;
  /**
   * Callback invoked with the new URL after a successful upload or URL entry.
   * Called with `""` when the admin clears the image via the "×" button.
   */
  onChange: (url: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `InlineImageUpload` — compact 40×40 image picker for product/variant rows.
 *
 * Renders one of three states:
 *   - **Preview**: `value` is set → thumbnail + hover-reveal clear button.
 *   - **URL input**: `showUrlInput` is true → text field + confirm/cancel.
 *   - **Placeholder**: neither of the above → dashed upload button + "URL" link.
 *
 * @param props - {@link Props}
 * @returns Inline image picker JSX.
 *
 * @example
 * <InlineImageUpload
 *   value={product.image_url}
 *   onChange={url => onUpdate(product.id, "image_url", url)}
 * />
 */
const InlineImageUpload = ({ value, onChange }: Props) => {
  /** True while the Cloudinary upload HTTP request is in-flight. */
  const [uploading, setUploading] = useState(false);

  /** Whether the URL text input is currently shown instead of the placeholder. */
  const [showUrlInput, setShowUrlInput] = useState(false);

  /** Controlled value of the URL text input. */
  const [urlValue, setUrlValue] = useState("");

  /**
   * Ref to the hidden `<input type="file">`.
   * Programmatically clicked by the placeholder button to open the OS picker.
   * Reset to `""` after each file selection so the same file can be re-picked.
   */
  const inputRef = useRef<HTMLInputElement>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // Handlers
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Validates and uploads a file to Cloudinary.
   *
   * Guards (in order):
   *   1. MIME type must start with "image/" — rejects PDFs, ZIPs, etc.
   *      Bengali toast: "ইমেজ ফাইল দিন" (Please provide an image file).
   *   2. File size must not exceed 5 MB (5 × 1024 × 1024 bytes).
   *      Bengali toast: "সর্বোচ্চ 5MB" (Maximum 5 MB).
   *
   * Upload:
   *   - `uploadToCloudinary` is lazy-imported to keep the initial bundle slim.
   *   - Folder argument `"products"` maps to the Cloudinary upload preset.
   *   - On failure (`result.success === false`): shows `result.error` toast.
   *   - On success: calls `onChange(result.url!)` to propagate the CDN URL up.
   *
   * @param file - The `File` object selected by the admin.
   */
  const upload = async (file: File) => {
    // Guard 1: MIME type check — must be an image.
    if (!file.type.startsWith("image/")) {
      toast.error("ইমেজ ফাইল দিন"); // Bengali: "Please provide an image file"
      return;
    }

    // Guard 2: File size limit — max 5 MB.
    if (file.size > 5 * 1024 * 1024) {
      toast.error("সর্বোচ্চ 5MB"); // Bengali: "Maximum 5MB"
      return;
    }

    setUploading(true);
    try {
      // Lazy import — avoids bundling Cloudinary in the initial JS chunk.
      const { uploadToCloudinary } = await import("@/lib/cloudinary");

      // Upload to the "products" Cloudinary folder/preset.
      const result = await uploadToCloudinary(file, "products");

      if (!result.success) {
        // Cloudinary returned an error — show it and abort without calling onChange.
        toast.error(result.error || "Upload failed");
        setUploading(false);
        return;
      }

      // Propagate the new CDN URL to the parent field updater.
      onChange(result.url!);
    } catch (err: any) {
      // Network error or unexpected exception during lazy-import or upload.
      toast.error(err.message);
    }

    setUploading(false);
  };

  /**
   * Applies the URL from the text input to the parent.
   * Trims whitespace, calls `onChange`, then resets and hides the input.
   * No-op if the trimmed value is empty.
   */
  const applyUrl = () => {
    if (urlValue.trim()) {
      onChange(urlValue.trim());
      setUrlValue("");
      setShowUrlInput(false);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex items-center gap-1.5">
      {value ? (
        /*
         * ── State 1: Preview ──────────────────────────────────────────────
         * Shows a 40×40 rounded thumbnail of the current image URL.
         * On hover, a destructive "×" button appears in the top-right corner.
         * Clicking "×" calls onChange("") to clear the image field.
         */
        <div className="relative group">
          <img
            src={value}
            alt=""
            className="w-10 h-10 rounded object-cover border"
          />
          <button
            type="button"
            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => onChange("")}
          >
            ×
          </button>
        </div>
      ) : showUrlInput ? (
        /*
         * ── State 2: URL text input ───────────────────────────────────────
         * Shown when admin clicked the "URL" link button.
         * Enter key triggers applyUrl(); ✓ button also triggers it.
         * The × button hides the input without applying anything.
         */
        <div className="flex items-center gap-1">
          <Input
            className="h-8 text-[11px] w-32 sm:w-40"
            placeholder="https://... URL"
            value={urlValue}
            onChange={e => setUrlValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyUrl();
              }
            }}
            autoFocus
          />
          {/* Confirm URL button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={applyUrl}
          >
            <CheckCircle className="w-3.5 h-3.5 text-primary" />
          </Button>
          {/* Cancel URL input — hides the field without changing value */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowUrlInput(false)}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        /*
         * ── State 3: Placeholder (no image, no URL input) ─────────────────
         * Dashed-border 40×40 button to trigger the hidden file picker.
         * Small "URL" text link to switch to URL input mode.
         * While uploading, the image icon is replaced by a spinner.
         */
        <div className="flex items-center gap-0.5">
          {/* File upload trigger button */}
          <button
            type="button"
            className="w-10 h-10 rounded border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-primary/50 transition-colors"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            title="ফাইল আপলোড" // Bengali: "File upload"
          >
            {uploading ? (
              // Spinner shown while Cloudinary upload is in-flight
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : (
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {/* URL mode toggle link. Bengali title: "দিন URL" (Provide URL) */}
          <button
            type="button"
            className="text-[9px] text-primary hover:underline whitespace-nowrap"
            onClick={() => setShowUrlInput(true)}
            title="URL দিন" // Bengali: "Enter URL"
          >
            URL
          </button>
        </div>
      )}

      {/*
       * Hidden file input — triggered programmatically by the placeholder button.
       * `accept="image/*"` restricts the OS picker to image files (UX hint only;
       * `upload()` also validates the MIME type at runtime).
       * `e.target.value = ""` reset ensures re-selecting the same file fires
       * onChange again (browsers skip the event if the value is unchanged).
       */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          if (e.target.files?.[0]) upload(e.target.files[0]);
          e.target.value = ""; // Reset so same file can be re-selected
        }}
      />
    </div>
  );
};

export default InlineImageUpload;
