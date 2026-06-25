/**
 * @file getFriendlyError.ts
 * @module lib/error/getFriendlyError
 *
 * Normalises any thrown value (Error, Supabase error, fetch error, string,
 * unknown) into a short, user-facing message — bilingual (Bengali + English)
 * where appropriate.
 *
 * যেকোনো error-কে ব্যবহারকারীর জন্য বোধগম্য বার্তায় রূপান্তর করে।
 *
 * Use this in every catch block before surfacing the message via toast/UI.
 */

import { ZodError } from "zod";

/** Default fallback message when nothing else matches. */
const DEFAULT_MESSAGE =
  "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন। / Something went wrong. Please try again.";

/**
 * Known error fingerprints → friendly bilingual messages.
 *
 * Matches are evaluated in order; the first substring match wins.
 * Keys are matched case-insensitively against the raw error message.
 */
const KNOWN_ERRORS: Array<{ match: RegExp; message: string }> = [
  // ── Network ──
  { match: /network request failed|failed to fetch|networkerror/i,
    message: "ইন্টারনেট কানেকশন চেক করুন। / Check your internet connection." },
  { match: /timeout|timed out/i,
    message: "সার্ভার সময়মতো সাড়া দেয়নি। আবার চেষ্টা করুন। / The server timed out. Please retry." },

  // ── Supabase auth ──
  { match: /invalid login credentials|invalid email or password/i,
    message: "ইমেইল বা পাসওয়ার্ড সঠিক নয়। / Incorrect email or password." },
  { match: /email not confirmed/i,
    message: "প্রথমে ইমেইল ভেরিফাই করুন। / Please verify your email first." },
  { match: /user already registered|already exists/i,
    message: "এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে। / An account with this email already exists." },
  { match: /password should be at least/i,
    message: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে। / Password must be at least 6 characters." },
  { match: /weak password|pwned|compromised/i,
    message: "পাসওয়ার্ডটি দুর্বল বা ফাঁস হয়েছে। অন্য একটি ব্যবহার করুন। / Password is weak or leaked. Choose another." },
  { match: /rate limit|too many requests/i,
    message: "অনেকবার চেষ্টা করেছেন। কিছুক্ষণ পর আবার চেষ্টা করুন। / Too many attempts. Try again later." },
  { match: /unsupported provider/i,
    message: "এই সাইন-ইন পদ্ধতি এখনও সক্রিয় নয়। / This sign-in method is not enabled yet." },

  // ── Auth / permissions ──
  { match: /jwt expired|invalid jwt|not authenticated/i,
    message: "আপনার সেশন শেষ হয়েছে। আবার সাইন ইন করুন। / Your session expired. Please sign in again." },
  { match: /permission denied|new row violates row-level security|not authorized/i,
    message: "এই কাজটি করার অনুমতি নেই। / You don't have permission to do that." },

  // ── Database / business rules ──
  { match: /duplicate key|unique constraint/i,
    message: "এই তথ্য আগেই বিদ্যমান। / This record already exists." },
  { match: /foreign key/i,
    message: "সম্পর্কিত ডেটা না থাকায় কাজটি করা যায়নি। / Related data missing." },
  { match: /out of stock|stock/i,
    message: "পণ্যটি স্টকে নেই। / This item is out of stock." },

  // ── Storage / upload ──
  { match: /payload too large|file size/i,
    message: "ফাইলটি অনেক বড়। ছোট ফাইল আপলোড করুন। / File too large. Upload a smaller file." },
];

/**
 * Convert any thrown value into a friendly bilingual message.
 *
 * @param err     The error caught from a try/catch or rejected promise.
 * @param fallback Optional override for the default fallback message.
 * @returns        A short user-facing string safe to display in UI.
 */
export function getFriendlyError(err: unknown, fallback = DEFAULT_MESSAGE): string {
  if (!err) return fallback;

  // Zod schema validation → join all field issues into one line.
  if (err instanceof ZodError) {
    return err.issues.map((i) => i.message).join(" • ");
  }

  // Extract the raw message from common shapes (Error, Supabase, fetch).
  const raw =
    typeof err === "string"
      ? err
      : (err as { message?: string; error_description?: string; msg?: string; details?: string })
          ?.message ||
        (err as { error_description?: string })?.error_description ||
        (err as { msg?: string })?.msg ||
        (err as { details?: string })?.details ||
        "";

  if (!raw) return fallback;

  // Already-Bengali messages from edge functions / DB triggers — show as-is.
  // (Heuristic: contains a Bengali code point.)
  if (/[\u0980-\u09FF]/.test(raw)) return raw;

  // Match against known fingerprints.
  for (const { match, message } of KNOWN_ERRORS) {
    if (match.test(raw)) return message;
  }

  // Last resort: return the raw message, capped to avoid leaking giant stacks.
  return raw.length > 200 ? `${raw.slice(0, 197)}…` : raw;
}
