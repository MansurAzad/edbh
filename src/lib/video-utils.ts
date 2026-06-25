// ============= Full file contents =============

/**
 * @file video-utils.ts
 * @module lib/video-utils
 *
 * @description
 * Utility functions for detecting, parsing, and transforming video URLs from
 * the four supported providers: YouTube, Vimeo, Facebook, and direct file
 * hosting (MP4, WebM, or Cloudinary).
 *
 * **Supported URL forms**
 * | Provider  | Example |
 * |-----------|---------|
 * | YouTube   | `https://youtu.be/dQw4w9WgXcQ`, `?v=`, `/embed/`, `/shorts/` |
 * | Vimeo     | `https://vimeo.com/123456789` |
 * | Facebook  | `https://www.facebook.com/…/videos/…`, `https://fb.watch/…` |
 * | Direct    | Any URL not matching the above (Cloudinary, S3, CDN, etc.) |
 *
 * বাংলা টীকা:
 * এই ফাইলটি YouTube, Vimeo, Facebook ও সরাসরি ভিডিও URL সনাক্ত করতে
 * এবং embed URL তৈরি করতে ব্যবহৃত সহায়ক ফাংশন ধারণ করে।
 * Cloudinary URL-এর জন্য মোবাইল-বান্ধব অপ্টিমাইজেশনও সম্ভব।
 */

/**
 * Discriminated union of all video provider types recognised by this module.
 *
 * - `"youtube"` — YouTube watch, short, or embed URLs.
 * - `"vimeo"`   — Vimeo video URLs.
 * - `"facebook"` — Facebook video or fb.watch URLs.
 * - `"direct"`  — All other URLs; treated as a raw video file source.
 *
 * বাংলা: ভিডিও প্রদানকারীর ধরন।
 * YouTube, Vimeo, Facebook বা সরাসরি ফাইল।
 */
export type VideoType = 'youtube' | 'vimeo' | 'facebook' | 'direct';

/**
 * Detects the video provider from a URL string.
 *
 * Matching is case-insensitive and checks for:
 * - `youtube.com` or `youtu.be` → `"youtube"`
 * - `vimeo.com` → `"vimeo"`
 * - `facebook.com` or `fb.watch` → `"facebook"`
 * - anything else → `"direct"`
 *
 * @param {string} url - The raw video URL to inspect.
 * @returns {VideoType} The detected provider type.
 *
 * @example
 * getVideoType("https://youtu.be/abc123"); // → "youtube"
 * getVideoType("https://cdn.example.com/video.mp4"); // → "direct"
 *
 * বাংলা: URL থেকে ভিডিও প্রদানকারী সনাক্ত করে।
 * YouTube, Vimeo, Facebook বা সরাসরি ফাইল — চারটির মধ্যে একটি ফেরত দেয়।
 */
export function getVideoType(url: string): VideoType {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/vimeo\.com/i.test(url)) return 'vimeo';
  if (/facebook\.com|fb\.watch/i.test(url)) return 'facebook';
  return 'direct';
}

/**
 * Extracts the 11-character YouTube video id from any supported YouTube URL format.
 *
 * Handles:
 * - `youtu.be/{id}` (short share link)
 * - `youtube.com/watch?v={id}` (standard watch)
 * - `youtube.com/embed/{id}` (embed)
 * - `youtube.com/v/{id}` (legacy)
 * - `youtube.com/shorts/{id}` (Shorts)
 *
 * @param {string} url - A YouTube URL in any of the supported formats.
 * @returns {string | null} The 11-character video id, or `null` if not found.
 *
 * @example
 * getYouTubeId("https://youtu.be/dQw4w9WgXcQ"); // → "dQw4w9WgXcQ"
 * getYouTubeId("https://example.com/page");      // → null
 *
 * বাংলা: YouTube URL থেকে ১১ অক্ষরের ভিডিও আইডি বের করে।
 * শর্ট লিংক, watch, embed, shorts সব ধরনের URL সমর্থিত।
 */
export function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match?.[1] || null;
}

/**
 * Extracts the numeric Vimeo video id from a Vimeo URL.
 *
 * Handles both `vimeo.com/{id}` and `vimeo.com/video/{id}` formats.
 *
 * @param {string} url - A Vimeo video URL.
 * @returns {string | null} The numeric video id as a string, or `null` if not found.
 *
 * @example
 * getVimeoId("https://vimeo.com/123456789");       // → "123456789"
 * getVimeoId("https://vimeo.com/video/987654321"); // → "987654321"
 *
 * বাংলা: Vimeo URL থেকে সংখ্যাসূচক ভিডিও আইডি বের করে।
 */
export function getVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match?.[1] || null;
}

/**
 * Converts any supported video URL into an embeddable `<iframe>` `src`.
 *
 * - **YouTube** — `https://www.youtube.com/embed/{id}?autoplay=1&rel=0&modestbranding=1`
 *   (`rel=0` suppresses related-video suggestions; `modestbranding=1` hides the
 *   YouTube logo to reduce visual distraction.)
 * - **Vimeo** — `https://player.vimeo.com/video/{id}?autoplay=1`
 * - **Facebook** — `https://www.facebook.com/plugins/video.php?href={encoded}&autoplay=true`
 * - **Direct** — returns `null` (use a `<video>` element instead of an `<iframe>`).
 *
 * @param {string} url - Original video URL from any supported provider.
 * @returns {string | null} Embed URL, or `null` for direct / unknown URLs.
 *
 * @example
 * getEmbedUrl("https://youtu.be/dQw4w9WgXcQ");
 * // → "https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1"
 *
 * getEmbedUrl("https://cdn.example.com/clip.mp4"); // → null
 *
 * বাংলা: YouTube, Vimeo বা Facebook URL-কে iframe embed URL-এ রূপান্তর করে।
 * সরাসরি ফাইল URL-এর জন্য null ফেরত দেয় — সেক্ষেত্রে <video> ট্যাগ ব্যবহার করুন।
 */
export function getEmbedUrl(url: string): string | null {
  const type = getVideoType(url);

  if (type === 'youtube') {
    const id = getYouTubeId(url);
    // rel=0 hides related videos; modestbranding=1 removes the YouTube watermark.
    // বাংলা: সম্পর্কিত ভিডিও ও ওয়াটারমার্ক লুকানোর জন্য প্যারামিটার যোগ।
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0&modestbranding=1` : null;
  }

  if (type === 'vimeo') {
    const id = getVimeoId(url);
    return id ? `https://player.vimeo.com/video/${id}?autoplay=1` : null;
  }

  if (type === 'facebook') {
    // Facebook requires the full original URL percent-encoded as `href`.
    // বাংলা: Facebook embed-এর জন্য মূল URL এনকোড করে `href` প্যারামিটারে দেওয়া হয়।
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=true`;
  }

  // Direct URLs cannot be embedded in an iframe — caller should use <video>.
  // বাংলা: সরাসরি ফাইলের জন্য embed URL নেই; <video> ট্যাগ ব্যবহার করুন।
  return null;
}

/**
 * Returns `true` when the URL belongs to an embeddable provider (YouTube,
 * Vimeo, or Facebook), meaning an `<iframe>` should be rendered instead of a
 * native `<video>` element.
 *
 * @param {string} url - Video URL to test.
 * @returns {boolean} `true` if the URL requires an embed iframe, `false` for direct files.
 *
 * @example
 * isEmbedVideo("https://youtu.be/abc"); // → true
 * isEmbedVideo("https://cdn.example.com/vid.mp4"); // → false
 *
 * বাংলা: URL যদি YouTube/Vimeo/Facebook-এর হয় তাহলে true ফেরত দেয়।
 * সরাসরি ফাইলের জন্য false — <video> ট্যাগ ব্যবহার করতে হবে।
 */
export function isEmbedVideo(url: string): boolean {
  return getVideoType(url) !== 'direct';
}

/**
 * Optimises a **Cloudinary** video URL for fast streaming, especially on mobile.
 *
 * Injects Cloudinary transformation parameters directly into the URL path:
 * - `f_auto`  — serves the best format the browser supports (WebM, MP4, etc.).
 * - `q_auto`  — adaptive quality that balances file size and visual fidelity.
 * - `vc_auto` — chooses the most efficient video codec (VP9, H.265, H.264).
 * - `w_720`   — (mobile only) down-scales to 720 px wide for faster loading on
 *               small screens and metered connections.
 *
 * **No-op conditions** (returns the original URL unchanged):
 * - URL is empty / falsy.
 * - URL does not match the `res.cloudinary.com/…/video/upload/` pattern.
 * - Transformation params are already present immediately after `/upload/`
 *   (detected by the leading `key_value` segment pattern) — prevents double-injection.
 *
 * @param {string} url - The original Cloudinary video URL.
 * @param {{ mobile?: boolean }} [opts={}] - Options.
 * @param {boolean} [opts.mobile=false] - When `true`, adds `w_720` to cap width
 *   for mobile delivery.
 * @returns {string} The URL with Cloudinary transformation params injected, or
 *   the original URL if the input is not a Cloudinary video URL.
 *
 * @example
 * // Desktop — injects f_auto,q_auto,vc_auto
 * optimizeVideoUrl("https://res.cloudinary.com/demo/video/upload/sample.mp4");
 * // → "https://res.cloudinary.com/demo/video/upload/f_auto,q_auto,vc_auto/sample.mp4"
 *
 * @example
 * // Mobile — also caps width at 720 px
 * optimizeVideoUrl("https://res.cloudinary.com/demo/video/upload/sample.mp4", { mobile: true });
 * // → "https://res.cloudinary.com/demo/video/upload/f_auto,q_auto,vc_auto,w_720/sample.mp4"
 *
 * @example
 * // Already transformed — returned unchanged
 * optimizeVideoUrl("https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/sample.mp4");
 * // → "https://res.cloudinary.com/demo/video/upload/f_auto,q_auto/sample.mp4"
 *
 * বাংলা: Cloudinary ভিডিও URL-এ স্বয়ংক্রিয় ফরম্যাট, কোয়ালিটি ও কোডেক
 * ট্রান্সফর্মেশন যোগ করে দ্রুত স্ট্রিমিং নিশ্চিত করে।
 * মোবাইলের জন্য `mobile: true` দিলে প্রস্থ ৭২০px-এ সীমাবদ্ধ হয়।
 * Cloudinary URL না হলে বা আগে থেকে ট্রান্সফর্মেশন থাকলে অপরিবর্তিত ফেরত দেয়।
 */
export function optimizeVideoUrl(url: string, opts: { mobile?: boolean } = {}): string {
  if (!url) return url;

  // Only process genuine Cloudinary video delivery URLs.
  // বাংলা: শুধুমাত্র Cloudinary ভিডিও URL প্রক্রিয়া করা হয়।
  if (!/res\.cloudinary\.com\/.+\/video\/upload\//.test(url)) return url;

  const marker = "/video/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;

  const after = url.slice(idx + marker.length);

  // Guard: if the segment immediately after /upload/ already looks like a
  // Cloudinary transformation string (e.g. "f_auto,q_auto/…"), skip injection
  // to avoid doubling up params.
  // বাংলা: আগে থেকে ট্রান্সফর্মেশন থাকলে পুনরায় যোগ করা হয় না।
  if (/^[a-z]{1,3}_[^/]+(,[a-z]{1,3}_[^/]+)*\//.test(after)) return url;

  // Build the transformation param string.
  // বাংলা: ট্রান্সফর্মেশন প্যারামিটার তৈরি।
  const params = ["f_auto", "q_auto", "vc_auto"];
  if (opts.mobile) params.push("w_720"); // cap width on mobile
  // বাংলা: মোবাইলে প্রস্থ ৭২০px-এ সীমাবদ্ধ করা হয়।

  return `${url.slice(0, idx + marker.length)}${params.join(",")}/${after}`;
}
