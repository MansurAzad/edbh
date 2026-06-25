/**
 * @file CustomersTable.tsx
 * @description Presentational data table for the admin Customers panel.
 * Renders a list of {@link UnifiedCustomer} rows inside a shadcn `<Table>`.
 * Each row exposes inline actions for editing, deleting, blocking, and
 * unblocking a customer.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Column layout
 * ────────────────────────────────────────────────────────────────────────────
 *  নাম        – full name + optional email sub-line
 *  যোগাযোগ   – phone number with Phone icon, or "–"
 *  ঠিকানা    – street address (truncated) + city with MapPin icon, or "–"
 *  ধরন        – type badge: ব্লকড / গেস্ট / রেজিস্টার্ড
 *  তারিখ     – `created_at` formatted to Bengali locale (bn-BD)
 *  অ্যাকশন   – Edit · Delete · Block/Unblock buttons
 *
 * ────────────────────────────────────────────────────────────────────────────
 * States
 * ────────────────────────────────────────────────────────────────────────────
 *  loading=true           → single full-width "লোড হচ্ছে..." row
 *  customers.length === 0 → single full-width "কোনো কাস্টমার পাওয়া যায়নি" row
 *  otherwise              → one `<TableRow>` per customer
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Blocked-user styling
 * ────────────────────────────────────────────────────────────────────────────
 *  Rows for blocked customers receive `bg-destructive/5` (a faint red tint)
 *  so they are immediately distinguishable at a glance.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Data flow
 * ────────────────────────────────────────────────────────────────────────────
 *  Parent → this component via props only.  No internal state, no hooks.
 *  All callbacks (`onEdit`, `onDelete`, `onBlock`, `onUnblock`) are lifted to
 *  the parent page which owns the mutation logic and toast notifications.
 *
 * বাংলা নোট:
 *  এই কম্পোনেন্ট শুধু ডেটা দেখায়।  কোনো API কল বা স্টেট নেই।
 *  সমস্ত অ্যাকশন প্যারেন্ট পেজে হ্যান্ডেল হয়।  কলব্যাক প্রপস হিসেবে আসে।
 *
 * @module CustomersTable
 */

import {
  MapPin,
  Pencil,
  Phone,
  ShieldBan,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UnifiedCustomer } from "@/lib/admin/customerHelpers";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Props for {@link CustomersTable}.
 *
 * @interface Props
 *
 * @property {boolean}          loading        – When `true` the table renders a
 *   single placeholder row instead of data rows.
 *   বাংলা: `true` হলে "লোড হচ্ছে..." দেখানো হয়।
 *
 * @property {UnifiedCustomer[]} customers     – Flat list of ALL customers
 *   (already filtered/sorted by the parent) to be rendered.
 *   বাংলা: প্যারেন্ট থেকে ফিল্টার করা কাস্টমার তালিকা।
 *
 * @property {Set<string>}      blockedSet     – Set of `user_id` strings that
 *   are currently blocked.  Membership check is O(1) per row.
 *   বাংলা: বর্তমানে ব্লকড ব্যবহারকারীদের `user_id`-এর Set।
 *
 * @property {(c: UnifiedCustomer) => void} onEdit   – Called when the pencil
 *   (edit) button is clicked.  Opens the edit dialog in the parent.
 *   বাংলা: এডিট বাটনে ক্লিক করলে কল হয়।
 *
 * @property {(c: UnifiedCustomer) => void} onDelete – Called when the trash
 *   icon is clicked.  Parent shows a confirmation dialog before deleting.
 *   বাংলা: ডিলিট বাটনে ক্লিক করলে কল হয়।
 *
 * @property {(userId: string, name: string) => void} onBlock – Called when the
 *   "ব্লক" button is clicked on a registered, non-blocked customer.
 *   `name` is passed so the parent can display it in the confirmation message.
 *   বাংলা: ব্লক বাটনে ক্লিক করলে কল হয়; `name` কনফার্মেশন মেসেজে ব্যবহার হয়।
 *
 * @property {(userId: string) => void} onUnblock – Called when "আনব্লক" is
 *   clicked on a currently-blocked registered customer.
 *   বাংলা: আনব্লক বাটনে ক্লিক করলে কল হয়।
 *
 * @property {boolean} unblockPending – When `true` the "আনব্লক" button is
 *   disabled to prevent double-submission while the mutation is in flight.
 *   বাংলা: `true` হলে আনব্লক বাটন নিষ্ক্রিয় থাকে (মিউটেশন চলাকালীন)।
 */
interface Props {
  /** Skeleton/loading state — shows a single placeholder row when true. লোডিং অবস্থা। */
  loading: boolean;
  /** Filtered customer list to display. ফিল্টার করা কাস্টমার তালিকা। */
  customers: UnifiedCustomer[];
  /** Set of currently-blocked user_ids for O(1) lookup per row. ব্লকড user_id গুলোর Set। */
  blockedSet: Set<string>;
  /** Callback to open the edit dialog for a customer. এডিট ডায়ালগ খোলার কলব্যাক। */
  onEdit: (c: UnifiedCustomer) => void;
  /** Callback to initiate customer deletion (parent handles confirmation). ডিলিট কলব্যাক। */
  onDelete: (c: UnifiedCustomer) => void;
  /** Callback to block a registered customer by userId + display name. ব্লক কলব্যাক। */
  onBlock: (userId: string, name: string) => void;
  /** Callback to unblock a currently-blocked customer. আনব্লক কলব্যাক। */
  onUnblock: (userId: string) => void;
  /** Disables the unblock button while the mutation is in flight. আনব্লক মিউটেশন পেন্ডিং। */
  unblockPending: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `CustomersTable` — scrollable admin table for customer management.
 *
 * Renders the full customer list with inline block/unblock controls.
 * The table is wrapped in a `border rounded-lg` container that clips
 * the shadow and keeps the rounded corners on all viewports.
 *
 * ### Usage
 * ```tsx
 * <CustomersTable
 *   loading={isLoading}
 *   customers={filteredCustomers}
 *   blockedSet={blockedUserIds}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 *   onBlock={handleBlock}
 *   onUnblock={handleUnblock}
 *   unblockPending={isUnblocking}
 * />
 * ```
 *
 * ### Type-badge logic
 * | Condition                            | Badge                                  |
 * |--------------------------------------|----------------------------------------|
 * | `blockedSet.has(customer.user_id)`   | destructive red "ব্লকড"               |
 * | `customer.type === "guest"`          | outline "গেস্ট"                        |
 * | otherwise (registered, not blocked) | secondary "রেজিস্টার্ড"               |
 *
 * Block/unblock buttons are only shown for `type === "registered"` customers,
 * because guest customers have no `user_id` to block.
 *
 * @param {Props} props – See {@link Props}.
 * @returns {JSX.Element} A bordered `<div>` wrapping a shadcn `<Table>`.
 *
 * বাংলা নোট:
 *  গেস্ট কাস্টমারদের জন্য ব্লক/আনব্লক বাটন দেখানো হয় না কারণ
 *  তাদের কোনো `user_id` নেই।  শুধু রেজিস্টার্ড ব্যবহারকারীদের ব্লক করা যায়।
 */
export default function CustomersTable({
  loading,
  customers,
  blockedSet,
  onEdit,
  onDelete,
  onBlock,
  onUnblock,
  unblockPending,
}: Props) {
  return (
    /** Outer wrapper — provides border + rounded corners around the table. */
    <div className="border rounded-lg">
      <Table>

        {/* ── Column headers ──────────────────────────────────────────────── */}
        <TableHeader>
          <TableRow>
            {/* নাম — customer full name + email sub-line (বাংলা: নাম) */}
            <TableHead>নাম</TableHead>
            {/* যোগাযোগ — phone number with icon (বাংলা: যোগাযোগ = Contact) */}
            <TableHead>যোগাযোগ</TableHead>
            {/* ঠিকানা — street address + city (বাংলা: ঠিকানা = Address) */}
            <TableHead>ঠিকানা</TableHead>
            {/* ধরন — customer type badge: blocked / guest / registered (বাংলা: ধরন = Type) */}
            <TableHead>ধরন</TableHead>
            {/* তারিখ — registration/order date formatted to bn-BD locale (বাংলা: তারিখ = Date) */}
            <TableHead>তারিখ</TableHead>
            {/* অ্যাকশন — right-aligned action buttons (বাংলা: অ্যাকশন = Actions) */}
            <TableHead className="text-right">অ্যাকশন</TableHead>
          </TableRow>
        </TableHeader>

        {/* ── Table body ──────────────────────────────────────────────────── */}
        <TableBody>
          {loading ? (
            /**
             * Loading state: single full-width cell with a Bengali loading message.
             * বাংলা: "লোড হচ্ছে..." — ডেটা লোড হওয়ার সময় দেখানো হয়।
             */
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                লোড হচ্ছে... {/* Loading... */}
              </TableCell>
            </TableRow>

          ) : customers.length === 0 ? (
            /**
             * Empty state: single full-width cell indicating no results.
             * বাংলা: "কোনো কাস্টমার পাওয়া যায়নি" — কোনো মিলে যাওয়া কাস্টমার নেই।
             */
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                কোনো কাস্টমার পাওয়া যায়নি {/* No customers found */}
              </TableCell>
            </TableRow>

          ) : (
            /**
             * Data rows: one per customer in the `customers` array.
             * The `key` uses `customer.id` (stable DB primary key).
             * Blocked rows receive a faint red tint via `bg-destructive/5`.
             */
            customers.map((customer) => {
              /**
               * Lookup whether this customer is currently blocked.
               * Uses Set.has() for O(1) performance regardless of list size.
               * বাংলা: এই কাস্টমার ব্লকড কিনা O(1) Set লুকআপে চেক করা হচ্ছে।
               */
              const isBlocked = blockedSet.has(customer.user_id);

              return (
                <TableRow
                  key={customer.id}
                  /**
                   * Faint red row background for blocked customers.
                   * Makes blocked entries visually pop without hiding the text.
                   * বাংলা: ব্লকড কাস্টমারের সারিতে হালকা লাল ব্যাকগ্রাউন্ড।
                   */
                  className={isBlocked ? "bg-destructive/5" : ""}
                >

                  {/* ── Column: নাম (Name) ──────────────────────────────── */}
                  <TableCell>
                    {/*
                     * Primary text: full name. Falls back to a Bengali
                     * placeholder if `full_name` is null/empty.
                     * বাংলা: নাম না থাকলে "নাম দেওয়া হয়নি" দেখানো হয়।
                     */}
                    <div className="font-medium">
                      {customer.full_name || "নাম দেওয়া হয়নি" /* "Name not provided" */}
                    </div>
                    {/*
                     * Secondary text: email (only shown if present).
                     * বাংলা: ইমেইল থাকলে ছোট টেক্সটে দেখানো হয়।
                     */}
                    {customer.email && (
                      <div className="text-xs text-muted-foreground">{customer.email}</div>
                    )}
                  </TableCell>

                  {/* ── Column: যোগাযোগ (Contact / Phone) ──────────────── */}
                  <TableCell>
                    {customer.phone ? (
                      /*
                       * Phone number with a small Phone icon for visual clarity.
                       * বাংলা: ফোন নম্বর আইকনসহ দেখানো হয়।
                       */
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {customer.phone}
                      </div>
                    ) : (
                      /* No phone — render an em-dash placeholder. বাংলা: ফোন নেই → "–" */
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>

                  {/* ── Column: ঠিকানা (Address) ─────────────────────── */}
                  <TableCell>
                    <div className="text-sm">
                      {/*
                       * Street address: truncated to 200 px max width to
                       * prevent overly long addresses from breaking layout.
                       * বাংলা: ঠিকানা বেশি লম্বা হলে কেটে দেখানো হয় (truncate)।
                       */}
                      {customer.address && (
                        <div className="truncate max-w-[200px]">{customer.address}</div>
                      )}
                      {/*
                       * City with a small MapPin icon below the street address.
                       * বাংলা: শহরের নাম MapPin আইকনসহ দেখানো হয়।
                       */}
                      {customer.city && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          {customer.city}
                        </div>
                      )}
                      {/* Neither address nor city is available. বাংলা: ঠিকানা নেই → "–" */}
                      {!customer.address && !customer.city && (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>

                  {/* ── Column: ধরন (Type badge) ─────────────────────── */}
                  <TableCell>
                    {isBlocked ? (
                      /*
                       * Blocked badge — destructive red, ShieldBan icon.
                       * Shown for any customer whose user_id is in blockedSet.
                       * বাংলা: ব্লকড → লাল ব্যাজ "ব্লকড"।
                       */
                      <Badge variant="destructive" className="gap-1">
                        <ShieldBan className="w-3 h-3" />
                        ব্লকড {/* Blocked */}
                      </Badge>
                    ) : customer.type === "guest" ? (
                      /*
                       * Guest badge — outline style, UserX icon.
                       * Guest customers checked out without creating an account.
                       * বাংলা: গেস্ট → আউটলাইন ব্যাজ "গেস্ট"।
                       */
                      <Badge variant="outline" className="gap-1">
                        <UserX className="w-3 h-3" />
                        গেস্ট {/* Guest */}
                      </Badge>
                    ) : (
                      /*
                       * Registered badge — secondary style, UserCheck icon.
                       * Registered customers have a Supabase auth account.
                       * বাংলা: রেজিস্টার্ড → সেকেন্ডারি ব্যাজ "রেজিস্টার্ড"।
                       */
                      <Badge variant="secondary" className="gap-1">
                        <UserCheck className="w-3 h-3" />
                        রেজিস্টার্ড {/* Registered */}
                      </Badge>
                    )}
                  </TableCell>

                  {/* ── Column: তারিখ (Date) ─────────────────────────── */}
                  {/*
                   * `created_at` formatted with the bn-BD locale so digits and
                   * month names appear in Bangla script automatically.
                   * বাংলা: তারিখ বাংলা লোকেল (bn-BD) অনুযায়ী ফর্ম্যাট হয়।
                   * Example output: ১৫ জানুয়ারি ২০২৪
                   */}
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(customer.created_at).toLocaleDateString("bn-BD")}
                  </TableCell>

                  {/* ── Column: অ্যাকশন (Actions) ───────────────────── */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">

                      {/* Edit button — pencil icon, opens the edit dialog */}
                      {/* বাংলা: এডিট বাটন — ক্লিক করলে এডিট ডায়ালগ খুলবে */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => onEdit(customer)}
                        title="এডিট" /* Edit */
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>

                      {/* Delete button — trash icon, destructive red on hover */}
                      {/* বাংলা: ডিলিট বাটন — ক্লিক করলে ডিলিট কনফার্মেশন আসবে */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => onDelete(customer)}
                        title="ডিলিট" /* Delete */
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>

                      {/*
                       * Block / Unblock buttons — only shown for registered customers.
                       * Guest customers have no user_id and cannot be blocked.
                       * বাংলা: শুধু রেজিস্টার্ড কাস্টমারদের জন্য ব্লক/আনব্লক বাটন।
                       */}
                      {customer.type === "registered" && (
                        isBlocked ? (
                          /**
                           * UNBLOCK button — shown when `isBlocked === true`.
                           * Disabled while `unblockPending` to prevent double-submit.
                           * বাংলা: ব্লকড হলে "আনব্লক" বাটন দেখানো হয়।
                           *         মিউটেশন চলাকালীন বাটন নিষ্ক্রিয় থাকে।
                           */
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-8 text-xs"
                            onClick={() => onUnblock(customer.user_id)}
                            disabled={unblockPending}
                          >
                            <ShieldCheck className="w-3 h-3" />
                            আনব্লক {/* Unblock */}
                          </Button>
                        ) : (
                          /**
                           * BLOCK button — shown when `isBlocked === false`.
                           * Passes `full_name` so the parent can display it in the
                           * confirmation message.
                           * বাংলা: ব্লকড না হলে "ব্লক" বাটন দেখানো হয়।
                           *         কনফার্মেশনের জন্য নাম পাঠানো হয়।
                           */
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1 h-8 text-xs"
                            onClick={() => onBlock(customer.user_id, customer.full_name || "Unknown")}
                          >
                            <ShieldBan className="w-3 h-3" />
                            ব্লক {/* Block */}
                          </Button>
                        )
                      )}
                    </div>
                  </TableCell>

                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
