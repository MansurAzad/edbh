/**
 * @file languageMix.ts
 * Detects Bengali and English keywords being forced into the SAME paragraph
 * ("keyword stuffing across languages"), which reads unnaturally and dilutes
 * relevance signals. Emits a warning plus a suggestion to split the copy into
 * separate language sections.
 */

const BENGALI_RE = /[\u0980-\u09FF]/;
const LATIN_WORD_RE = /[A-Za-z][A-Za-z'-]*/g;
const BENGALI_WORD_RE = /[\u0980-\u09FF]+/g;

/** Latin tokens that are brand/uni-lingual and shouldn't count as "English". */
const NEUTRAL_LATIN = new Set([
  "dubai",
  "borka",
  "abaya",
  "hijab",
  "kaftan",
  "farasha",
  "nida",
  "karchupi",
  "house",
  "sku",
  "cod",
  "bd",
  "xl",
  "xxl",
]);

export type MixSeverity = "ok" | "warn" | "error";

export interface ParagraphMixReport {
  index: number;
  text: string;
  bengaliWords: number;
  englishWords: number;
  /** Share of the minority language, 0–0.5. */
  mixRatio: number;
  severity: MixSeverity;
  message?: string;
  suggestion?: string;
}

export interface LanguageMixReport {
  severity: MixSeverity;
  paragraphs: ParagraphMixReport[];
  warnings: ParagraphMixReport[];
  suggestion?: string;
}

/** Mixed-language share above this is a warning, above ERROR_RATIO an error. */
export const WARN_RATIO = 0.2;
export const ERROR_RATIO = 0.35;
/** Paragraphs shorter than this are ignored (labels, badges, CTAs). */
export const MIN_WORDS = 12;

export const splitParagraphs = (text: string): string[] =>
  text
    .split(/\n{2,}|\r\n\r\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/** Analyses one paragraph for forced Bengali + English mixing. */
export function analyseParagraph(text: string, index = 0): ParagraphMixReport {
  const bengaliWords = (text.match(BENGALI_WORD_RE) ?? []).length;
  const englishWords = (text.match(LATIN_WORD_RE) ?? []).filter(
    (w) => w.length > 2 && !NEUTRAL_LATIN.has(w.toLowerCase()),
  ).length;

  const total = bengaliWords + englishWords;
  const minority = Math.min(bengaliWords, englishWords);
  const mixRatio = total ? minority / total : 0;

  let severity: MixSeverity = "ok";
  let message: string | undefined;
  let suggestion: string | undefined;

  if (total >= MIN_WORDS && bengaliWords > 0 && englishWords > 0) {
    if (mixRatio >= ERROR_RATIO) {
      severity = "error";
      message = `একই প্যারাগ্রাফে ${bengaliWords}টি বাংলা ও ${englishWords}টি ইংরেজি শব্দ জোর করে মেশানো হয়েছে (${Math.round(mixRatio * 100)}%)।`;
    } else if (mixRatio >= WARN_RATIO) {
      severity = "warn";
      message = `বাংলা ও ইংরেজি কীওয়ার্ড একই প্যারাগ্রাফে মিশে গেছে (${Math.round(mixRatio * 100)}%)।`;
    }
    if (severity !== "ok") {
      suggestion =
        "কনটেন্টটি দুইটি আলাদা সেকশনে ভাগ করুন — একটি সম্পূর্ণ বাংলা প্যারাগ্রাফ (বাংলা কীওয়ার্ডসহ) এবং একটি সম্পূর্ণ English paragraph (English keywords). প্রতিটি সেকশনে আলাদা heading দিন, যেমন “বাংলায় বিস্তারিত” ও “In English”.";
    }
  }

  return { index, text, bengaliWords, englishWords, mixRatio, severity, message, suggestion };
}

/** Analyses a full document (paragraphs separated by blank lines). */
export function analyseLanguageMix(text: string): LanguageMixReport {
  const paragraphs = splitParagraphs(text).map((p, i) => analyseParagraph(p, i));
  const warnings = paragraphs.filter((p) => p.severity !== "ok");
  const severity: MixSeverity = warnings.some((w) => w.severity === "error")
    ? "error"
    : warnings.length
      ? "warn"
      : "ok";
  return {
    severity,
    paragraphs,
    warnings,
    suggestion: warnings[0]?.suggestion,
  };
}

/** Convenience: does this string contain any Bengali characters? */
export const hasBengali = (text: string) => BENGALI_RE.test(text);
