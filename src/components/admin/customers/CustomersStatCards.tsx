/**
 * @file CustomersStatCards.tsx
 * @description A responsive 4-column summary card grid displayed at the top of
 * the admin Customers page.  Each card surfaces a single high-level metric so
 * staff can instantly assess the customer base without scrolling the table.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Layout
 * ────────────────────────────────────────────────────────────────────────────
 *  Mobile  (< sm)  → 1 column
 *  Tablet  (sm+)   → 2 columns
 *  Desktop (lg+)   → 4 columns  (one card per metric)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Cards (left → right)
 * ────────────────────────────────────────────────────────────────────────────
 *  1. মোট কাস্টমার   – total unique customers (registered + guest combined)
 *  2. রেজিস্টার্ড    – customers who created a Supabase auth account
 *  3. গেস্ট          – customers who checked out without registering
 *  4. ব্লকড          – customers whose `user_id` appears in `blocked_users`
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Data flow
 * ────────────────────────────────────────────────────────────────────────────
 *  The parent page (AdminCustomers) derives all four counts from
 *  {@link UnifiedCustomer[]} + the `blockedSet` and passes them down as plain
 *  numbers.  This component is purely presentational — no hooks, no side
 *  effects, no data fetching.
 *
 * বাংলা নোট:
 *  এই কম্পোনেন্টটি শুধু UI। সব ডেটা প্রপস হিসেবে আসে।
 *  কার্ডের শিরোনামগুলো বাংলায় লেখা কারণ অ্যাডমিন প্যানেল বাংলাভাষী
 *  পরিচালকদের জন্য তৈরি।
 *
 * @module CustomersStatCards
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for {@link CustomersStatCards}.
 *
 * All values are non-negative integers pre-computed by the parent.
 *
 * @interface Props
 * @property {number} total      – Grand total of all customers (registered + guest).
 *                                  বাংলা: মোট কাস্টমার সংখ্যা (রেজিস্টার্ড + গেস্ট)।
 * @property {number} registered – Count of registered (auth-backed) customers.
 *                                  বাংলা: যারা অ্যাকাউন্ট খুলে কেনাকাটা করেছেন।
 * @property {number} guest      – Count of guest (no account) customers.
 *                                  বাংলা: যারা অ্যাকাউন্ট ছাড়া অর্ডার করেছেন।
 * @property {number} blocked    – Count of customers currently blocked.
 *                                  বাংলা: যাদের অ্যাকাউন্ট নিষিদ্ধ করা হয়েছে।
 */
interface Props {
  /** Grand total of all customers (registered + guest). মোট কাস্টমার। */
  total: number;
  /** Count of registered (Supabase auth) customers. রেজিস্টার্ড ব্যবহারকারী। */
  registered: number;
  /** Count of guest customers (no auth account). গেস্ট অর্ডারকারী। */
  guest: number;
  /** Count of customers in the `blocked_users` table. ব্লকড ব্যবহারকারী। */
  blocked: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `CustomersStatCards` — summary metric cards for the Customers admin panel.
 *
 * Renders four shadcn `<Card>` components arranged in a responsive grid.
 * Each card shows a Bengali-labelled title and a large bold number.
 *
 * ### Usage
 * ```tsx
 * <CustomersStatCards
 *   total={250}
 *   registered={180}
 *   guest={60}
 *   blocked={10}
 * />
 * ```
 *
 * ### Visual colours
 * | Card        | Number colour                  |
 * |-------------|--------------------------------|
 * | মোট         | default foreground             |
 * | রেজিস্টার্ড | `text-primary`                 |
 * | গেস্ট       | `text-muted-foreground`        |
 * | ব্লকড       | `text-destructive` (red)       |
 *
 * @param {Props} props – See {@link Props}.
 * @returns {JSX.Element} A `<div>` grid containing four metric cards.
 *
 * বাংলা নোট:
 *  কম্পোনেন্টটি কোনো স্টেট বা ইফেক্ট ব্যবহার করে না।
 *  প্রপস পরিবর্তন হলে React স্বয়ংক্রিয়ভাবে রি-রেন্ডার করবে।
 */
export default function CustomersStatCards({ total, registered, guest, blocked }: Props) {
  return (
    /**
     * Responsive grid wrapper.
     * – 1 col on mobile, 2 on sm (≥640 px), 4 on lg (≥1024 px).
     * বাংলা: মোবাইলে ১ কলাম, ট্যাবলেটে ২, ডেস্কটপে ৪।
     */
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

      {/* ── Card 1: Total customers ─────────────────────────────────────── */}
      {/* বাংলা শিরোনাম: "মোট কাস্টমার" — সব ধরনের কাস্টমারের মোট সংখ্যা */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            মোট কাস্টমার {/* Total Customers */}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Default foreground color — neutral emphasis */}
          <div className="text-2xl font-bold">{total}</div>
        </CardContent>
      </Card>

      {/* ── Card 2: Registered customers ────────────────────────────────── */}
      {/* বাংলা: যারা সাইটে অ্যাকাউন্ট তৈরি করেছেন — "রেজিস্টার্ড" */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            রেজিস্টার্ড {/* Registered */}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* text-primary gives a brand-coloured positive emphasis */}
          <div className="text-2xl font-bold text-primary">{registered}</div>
        </CardContent>
      </Card>

      {/* ── Card 3: Guest customers ──────────────────────────────────────── */}
      {/* বাংলা: যারা অ্যাকাউন্ট ছাড়া অর্ডার করেছেন — "গেস্ট" */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            গেস্ট {/* Guest */}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* text-muted-foreground: de-emphasised, guests are secondary accounts */}
          <div className="text-2xl font-bold text-muted-foreground">{guest}</div>
        </CardContent>
      </Card>

      {/* ── Card 4: Blocked customers ────────────────────────────────────── */}
      {/* বাংলা: যাদের অ্যাকাউন্ট ব্লক করা হয়েছে — "ব্লকড" */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            ব্লকড {/* Blocked */}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* text-destructive: red warning colour — draws immediate attention */}
          <div className="text-2xl font-bold text-destructive">{blocked}</div>
        </CardContent>
      </Card>

    </div>
  );
}
