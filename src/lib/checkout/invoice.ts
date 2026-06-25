/**
 * @fileoverview Invoice download utility for the checkout confirmation screen.
 *
 * Calls the Supabase Edge Function `generate-invoice`, which returns a PDF
 * blob, then triggers a browser file-download using a temporary `<a>` element.
 *
 * ইনভয়েস ডাউনলোড ইউটিলিটি।
 * Supabase Edge Function "generate-invoice" থেকে PDF ব্লব নিয়ে ব্রাউজারে
 * ডাউনলোড করার ট্রিগার করে।
 *
 * @module lib/checkout/invoice
 */

import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetches a PDF invoice for the given order from the backend and immediately
 * triggers a browser "Save As" download dialog.
 *
 * অর্ডারের জন্য PDF ইনভয়েস ব্যাকএন্ড থেকে এনে ব্রাউজারে ডাউনলোড করে।
 *
 * ### How it works / কীভাবে কাজ করে
 * 1. Invokes the `generate-invoice` Supabase Edge Function with `Accept: application/pdf`.
 * 2. Normalises the response into a `Blob` (handles both raw binary and pre-wrapped `Blob`).
 * 3. Creates a temporary object URL, attaches it to a hidden `<a>` tag, clicks it,
 *    then cleans up the DOM node and revokes the URL to free memory.
 *
 * ### Error handling / ত্রুটি হ্যান্ডলিং
 * Any Supabase invocation error is re-thrown so the calling component can
 * display a user-facing error toast.  ত্রুটি হলে throw করা হয়।
 *
 * @param {string} orderId - UUID of the order whose invoice should be downloaded.
 *   অর্ডারের UUID যেটির ইনভয়েস ডাউনলোড করতে হবে।
 * @returns {Promise<void>} Resolves when the download has been triggered.
 *   ডাউনলোড ট্রিগার হলে Promise resolve হয়।
 * @throws {Error} Re-throws the Supabase function invocation error on failure.
 *   Supabase ত্রুটি হলে throw করা হয়।
 *
 * @example
 * // Inside an order-confirmation component:
 * // অর্ডার কনফার্মেশন কম্পোনেন্টে ব্যবহার:
 * <button onClick={() => downloadInvoice(order.id).catch(console.error)}>
 *   Download Invoice / ইনভয়েস ডাউনলোড করুন
 * </button>
 */
export async function downloadInvoice(orderId: string): Promise<void> {
  // ── Step 1: Call the Edge Function ──────────────────────────────────────
  // Supabase Edge Function-এ POST করা হচ্ছে।
  // The `Accept` header tells the function we want binary PDF output.
  const { data, error } = await supabase.functions.invoke("generate-invoice", {
    body: { orderId },
    headers: { Accept: "application/pdf" },
  });

  // Re-throw so callers can handle the error (e.g. show a toast).
  // ত্রুটি হলে caller-কে জানানো হয়।
  if (error) throw error;

  // ── Step 2: Normalise response to a Blob ────────────────────────────────
  // `supabase.functions.invoke` may return either a raw ArrayBuffer/Uint8Array
  // or a pre-constructed Blob depending on the runtime environment.
  // Supabase রেসপন্স Blob বা binary হতে পারে, তাই normalize করা হচ্ছে।
  const blob =
    data instanceof Blob
      ? data
      : new Blob([data], { type: "application/pdf" });

  // ── Step 3: Create a temporary object URL ───────────────────────────────
  // একটি অস্থায়ী URL তৈরি করা হচ্ছে যা ব্রাউজার ডাউনলোড করতে পারবে।
  const url = URL.createObjectURL(blob);

  // ── Step 4: Programmatically trigger the download ───────────────────────
  // A hidden anchor element is injected, clicked, then immediately removed.
  // এটি ব্রাউজারের স্বাভাবিক ডাউনলোড ডায়ালগ খুলবে।
  const a = document.createElement("a");
  a.href = url;

  // File name format: INV-<first 8 chars of UUID uppercased>.pdf
  // যেমন: INV-A1B2C3D4.pdf
  a.download = `INV-${orderId.slice(0, 8).toUpperCase()}.pdf`;

  // The element must be in the DOM for Firefox to trigger the download.
  // Firefox-এ কাজ করার জন্য DOM-এ যোগ করা হচ্ছে।
  document.body.appendChild(a);
  a.click(); // Trigger the browser save dialog / ডাউনলোড ট্রিগার করা হচ্ছে

  // ── Step 5: Clean up ────────────────────────────────────────────────────
  // Remove the anchor from the DOM immediately after clicking.
  // ক্লিকের পরে DOM থেকে অ্যাঙ্কর সরানো হচ্ছে।
  document.body.removeChild(a);

  // Revoke the object URL to release the memory held by the Blob.
  // Blob-এর মেমোরি মুক্ত করা হচ্ছে।
  URL.revokeObjectURL(url);
}
