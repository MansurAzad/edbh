/**
 * @file ProductsPagination.tsx
 * @description Page-number navigation bar rendered below the products table.
 * Renders a Previous/Next button pair flanking up to 7 numbered page buttons.
 * Returns `null` when there is only one page (no pagination needed).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Window algorithm
 * ────────────────────────────────────────────────────────────────────────────
 * At most 7 numbered buttons are shown at once (matching a common UX pattern).
 * The 7-button window slides to keep `currentPage` visible:
 *
 *  | Condition                        | Window start    |
 *  |----------------------------------|-----------------|
 *  | totalPages ≤ 7                   | always page 1   |
 *  | currentPage ≤ 4                  | page 1          |
 *  | currentPage ≥ totalPages − 3     | totalPages − 6  |
 *  | otherwise                        | currentPage − 3 |
 *
 * This ensures the current page is always visible and centred where possible.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Result summary
 * ────────────────────────────────────────────────────────────────────────────
 * Displays "Showing X–Y of Z" on the left, page buttons on the right.
 *
 * বাংলা নোট:
 *  পেজিনেশন বারটি শুধু একাধিক পেজ থাকলে দেখায়।  এক পেজ হলে `null` রিটার্ন।
 *  "Showing" টেক্সট বর্তমান পেজে কতটি পণ্য দেখাচ্ছে তা জানায়।
 *
 * @module ProductsPagination
 */

import { Button } from "@/components/ui/button";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for {@link ProductsPagination}.
 *
 * @interface Props
 *
 * @property {number} currentPage  – 1-based index of the active page.
 *   বাংলা: বর্তমান পেজ নম্বর (১ থেকে শুরু)।
 *
 * @property {number} totalPages   – Total number of pages.
 *   বাংলা: মোট পেজ সংখ্যা।
 *
 * @property {number} total        – Total number of products matching current filters.
 *   Used in the "Showing X–Y of Z" label.
 *   বাংলা: ফিল্টার করা মোট পণ্যের সংখ্যা — "Showing X–Y of Z" লেবেলে ব্যবহৃত।
 *
 * @property {number} perPage      – Number of products displayed per page.
 *   Used to compute the "Showing" range.
 *   বাংলা: প্রতি পেজে কতটি পণ্য — রেঞ্জ হিসাব করতে ব্যবহৃত।
 *
 * @property {(page: number) => void} onChange
 *   Called with the new 1-based page number whenever the user clicks a page
 *   button, Previous, or Next.
 *   বাংলা: পেজ পরিবর্তনে নতুন পেজ নম্বর দিয়ে এই কলব্যাক ডাকা হয়।
 */
interface Props {
  /** 1-based current page index. বাংলা: বর্তমান পেজ (১ ভিত্তিক)। */
  currentPage: number;
  /** Total page count. বাংলা: মোট পেজ সংখ্যা। */
  totalPages: number;
  /** Total filtered product count (for the "Showing" label). বাংলা: মোট পণ্য সংখ্যা। */
  total: number;
  /** Products per page (for the "Showing" range calculation). বাংলা: প্রতি পেজে পণ্য সংখ্যা। */
  perPage: number;
  /** Page-change callback; receives the new 1-based page number. বাংলা: পেজ পরিবর্তনের কলব্যাক। */
  onChange: (page: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `ProductsPagination` — sliding-window page-number navigation bar.
 *
 * Returns `null` when `totalPages <= 1` so the caller never needs to
 * conditionally render it.
 *
 * ### Usage
 * ```tsx
 * <ProductsPagination
 *   currentPage={page}
 *   totalPages={Math.ceil(total / PER_PAGE)}
 *   total={total}
 *   perPage={PER_PAGE}
 *   onChange={setPage}
 * />
 * ```
 *
 * @param {Props} props – See {@link Props}.
 * @returns {JSX.Element | null} Pagination bar, or null when not needed.
 *
 * বাংলা নোট:
 *  এক পেজ হলে কিছুই রেন্ডার হয় না।
 *  "Previous" বাটন প্রথম পেজে এবং "Next" বাটন শেষ পেজে নিষ্ক্রিয় থাকে।
 */
export default function ProductsPagination({
  currentPage,
  totalPages,
  total,
  perPage,
  onChange,
}: Props) {
  /**
   * Early return: no pagination needed when there is only one page.
   * বাংলা: মাত্র একটি পেজ থাকলে পেজিনেশন বার দেখানো হয় না।
   */
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between">

      {/* ── Result summary label ─────────────────────────────────────── */}
      {/*
       * Shows "Showing A–B of C" where:
       *   A = first item index on current page = (currentPage - 1) * perPage + 1
       *   B = last item index on current page  = min(currentPage * perPage, total)
       *   C = total filtered product count
       * বাংলা: বর্তমান পেজে কতটি পণ্য দেখাচ্ছে এবং মোট কতটি আছে।
       */}
      <p className="text-sm text-muted-foreground">
        Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, total)} of {total}
      </p>

      {/* ── Page buttons ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1">

        {/* Previous button — disabled on page 1. বাংলা: প্রথম পেজে নিষ্ক্রিয়। */}
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onChange(currentPage - 1)}
        >
          Previous
        </Button>

        {/*
         * Sliding window of up to 7 numbered buttons.
         *
         * Array.from({ length: min(totalPages, 7) }) creates exactly 7 slots
         * (or fewer on small datasets).  The `page` value for each slot is
         * computed by the window-centering algorithm:
         *
         *  Case 1 – totalPages ≤ 7:       always show pages 1 → totalPages
         *  Case 2 – currentPage ≤ 4:      show pages 1 → 7  (left-anchored)
         *  Case 3 – near the end:         show last 7 pages  (right-anchored)
         *  Case 4 – middle of range:      centre window on currentPage
         *
         * The active page button gets `variant="default"` (filled); all others
         * get `variant="outline"`.
         *
         * বাংলা: সর্বোচ্চ ৭টি পেজ বাটন দেখানো হয়। বর্তমান পেজটি সক্রিয় (ভরা) দেখায়।
         */}
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          /** The 1-based page number this button slot maps to. */
          let page: number;

          if (totalPages <= 7) {
            // Case 1: Show all pages sequentially. বাংলা: সব পেজ সরাসরি দেখান।
            page = i + 1;
          } else if (currentPage <= 4) {
            // Case 2: Near the start — left-anchor window at page 1.
            // বাংলা: শুরুর দিকে — উইন্ডো ১ থেকে শুরু।
            page = i + 1;
          } else if (currentPage >= totalPages - 3) {
            // Case 3: Near the end — right-anchor window at totalPages.
            // বাংলা: শেষের দিকে — উইন্ডো শেষ ৭ পেজ দেখায়।
            page = totalPages - 6 + i;
          } else {
            // Case 4: Middle — centre the window on currentPage.
            // বাংলা: মাঝামাঝিতে — বর্তমান পেজ কেন্দ্রে রাখা হয়।
            page = currentPage - 3 + i;
          }

          return (
            <Button
              key={page}
              variant={currentPage === page ? "default" : "outline"}
              size="sm"
              className="w-9"
              onClick={() => onChange(page)}
            >
              {page}
            </Button>
          );
        })}

        {/* Next button — disabled on the last page. বাংলা: শেষ পেজে নিষ্ক্রিয়। */}
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= totalPages}
          onClick={() => onChange(currentPage + 1)}
        >
          Next
        </Button>

      </div>
    </div>
  );
}
