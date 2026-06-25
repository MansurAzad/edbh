/**
 * @file customerHelpers.ts
 * @description Domain types and pure utility functions shared by all Customers
 * admin views.  No Supabase calls live here — this module is purely
 * client-side type definitions and a CSV export helper.
 *
 * ----------------------------------------------------------------------------
 * Exports
 * ----------------------------------------------------------------------------
 *  UnifiedCustomer    – normalised view of both registered and guest customers
 *  BlockedUser        – row shape from the `blocked_users` Supabase table
 *  CustomerEditForm   – form payload for editing any customer
 *  CustomerAddForm    – form payload for adding a new guest customer (no email)
 *  exportCustomersCSV – trigger a BOM-prefixed CSV download
 *
 * ----------------------------------------------------------------------------
 * Supabase tables referenced (by consuming hooks, not this file)
 * ----------------------------------------------------------------------------
 *  • profiles       – registered user data (full_name, phone, address, city)
 *  • orders         – guest customer data extracted from guest checkout fields
 *  • blocked_users  – user_id, reason, is_active
 *
 * বাংলা নোট: এই ফাইলে শুধু টাইপ ও ইউটিলিটি। কোনো API কল নেই।
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * `UnifiedCustomer` – a normalised customer record that unifies rows from the
 * `profiles` table (registered users) and guest checkout data from `orders`.
 *
 * Discriminator: `type === "registered"` means the row came from `profiles`;
 * `type === "guest"` means it was synthesised from an `orders` row where
 * `is_guest = true`.
 *
 * For guest customers:
 *   id      → `"guest-<order_id>"` (prefixed string, not a UUID from profiles)
 *   user_id → `"guest-<shipping_phone>"` (synthetic, not a real auth UID)
 *   email   → `orders.guest_email`
 *
 * বাংলা: রেজিস্টার্ড ও গেস্ট উভয় ধরনের কাস্টমারকে একই স্ট্রাকচারে দেখানো হয়।
 */
export interface UnifiedCustomer {
  /** UUID from `profiles.id`; or synthetic `"guest-<order_id>"` string. */
  id: string;
  /**
   * Auth UID from `profiles.user_id`; or synthetic `"guest-<phone>"` string.
   * Used as the key in the `blockedSet` (Set<string>).
   */
  user_id: string;
  /** Customer display name (nullable if not provided). */
  full_name: string | null;
  /** Primary contact phone number (nullable). */
  phone: string | null;
  /** Street / flat shipping address (nullable). */
  address: string | null;
  /** City / district (nullable). */
  city: string | null;
  /** ISO-8601 creation timestamp. */
  created_at: string;
  /** "registered" = from profiles table; "guest" = from orders table. */
  type: "registered" | "guest";
  /**
   * Email address (nullable).
   * For registered users this is null here (fetched separately from auth);
   * for guests it comes from `orders.guest_email`.
   */
  email: string | null;
}

/**
 * `BlockedUser` – mirrors a row from the `blocked_users` Supabase table.
 *
 * RLS: only admin roles may read/write this table.
 * A blocked user has `is_active = true`; unblocking sets `is_active = false`
 * via an UPDATE (not DELETE) to preserve the audit trail.
 *
 * বাংলা: ব্লক করা ইউজারের তথ্য।
 */
export interface BlockedUser {
  /** Auth UID matching `profiles.user_id`. */
  user_id: string;
  /** Human-readable block reason recorded at time of block. */
  reason: string;
  /** True = currently blocked; false = previously blocked but now unblocked. */
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Form payload types
// ---------------------------------------------------------------------------

/**
 * `CustomerEditForm` – validated form values when editing an existing customer.
 *
 * Used by `CustomerEditDialog` and the `editMutation` in `useAdminCustomers`.
 *
 * For registered customers: updates `profiles` (email field is ignored).
 * For guest customers: updates `orders` guest fields; email updates
 * `orders.guest_email`.
 *
 * বাংলা: কাস্টমার এডিট ফর্মের ডেটা স্ট্রাকচার।
 */
export type CustomerEditForm = {
  /** Required: customer's full display name. */
  full_name: string;
  /** Required: primary contact phone (01XXXXXXXXX format expected). */
  phone: string;
  /** Optional: shipping address. */
  address: string;
  /** Optional: city / district. */
  city: string;
  /** Optional: email — only persisted for guest customers. */
  email: string;
};

/**
 * `CustomerAddForm` – form values when manually adding a new guest customer.
 *
 * Derived from `CustomerEditForm` with `email` omitted because newly added
 * guest records are created as stub `orders` rows without an email.
 *
 * বাংলা: নতুন কাস্টমার যোগ করার ফর্মের ডেটা (ইমেইল ছাড়া)।
 */
export type CustomerAddForm = Omit<CustomerEditForm, "email">;

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------

/**
 * `exportCustomersCSV` – serialises the customer list to a UTF-8
 * BOM-prefixed CSV and triggers a browser download.
 *
 * Column headers are written in Bengali to match the admin UI language.
 * The BOM (`\uFEFF`) ensures Microsoft Excel opens the file with correct
 * UTF-8 encoding without requiring a manual import wizard step.
 *
 * Columns exported:
 *   নাম, ফোন, ইমেইল, ঠিকানা, শহর, ধরন, ব্লকড, তারিখ
 *
 * The `blockedSet` (Set<string>) is used to resolve the "ব্লকড" column value
 * by checking whether `customer.user_id` is present in the set.
 *
 * Download filename: `customers-YYYY-MM-DD.csv`
 *
 * @param customers  – array of `UnifiedCustomer` objects to export
 * @param blockedSet – set of currently-blocked user_id strings
 * @returns `{ ok: boolean, count: number }` — ok=false if list is empty
 *
 * বাংলা: কাস্টমার তালিকা CSV ফাইলে এক্সপোর্ট করে।
 * Excel-এ বাংলা হেডার সঠিক দেখাতে BOM যুক্ত করা হয়েছে।
 */
export function exportCustomersCSV(
  customers: UnifiedCustomer[],
  blockedSet: Set<string>,
): { ok: boolean; count: number } {
  const rows = customers.map((c) => ({
    নাম:    c.full_name || "",
    ফোন:    c.phone || "",
    ইমেইল:  c.email || "",
    ঠিকানা: c.address || "",
    শহর:    c.city || "",
    // Localised type labels matching the UI badges
    ধরন:    c.type === "registered" ? "রেজিস্টার্ড" : "গেস্ট",
    // Resolve blocked status from the live blockedSet
    ব্লকড:  blockedSet.has(c.user_id) ? "হ্যাঁ" : "না",
    তারিখ:  new Date(c.created_at).toLocaleDateString("bn-BD"),
  }));

  // Guard: nothing to export
  if (rows.length === 0) return { ok: false, count: 0 };

  const headers = Object.keys(rows[0]);
  // \uFEFF = UTF-8 BOM; required for Excel to auto-detect encoding
  const csv =
    "\uFEFF" +
    [
      headers.join(","),
      ...rows.map((r) =>
        headers.map((h) => `"${(r as Record<string, string>)[h]}"`).join(","),
      ),
    ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url); // release object URL memory immediately after click
  return { ok: true, count: rows.length };
}
