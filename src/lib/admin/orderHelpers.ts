/**
 * @file orderHelpers.ts
 * @description Domain types, status constants, and pure presentational helper
 * functions shared across all Orders admin views.  No Supabase calls live here;
 * this module is purely client-side utility code.
 *
 * ----------------------------------------------------------------------------
 * Exports
 * ----------------------------------------------------------------------------
 *  AdminOrder          – mirrors the `orders` Supabase table row shape
 *  AdminOrderItem      – mirrors the `order_items` Supabase table row shape
 *  ORDER_STATUS_OPTIONS – readonly tuple of valid order lifecycle statuses
 *  getStatusColor      – Tailwind class string for an order status badge
 *  getPaymentStatusColor – Tailwind class string for a payment status badge
 *  printShippingLabel  – open a printable label in a new browser window
 *  exportOrdersCSV     – trigger a BOM-prefixed CSV download
 *
 * বাংলা নোট: এই ফাইলে শুধু টাইপ ও ইউটিলিটি ফাংশন আছে।
 * কোনো Supabase কল নেই — শুধু UI সহায়ক লজিক।
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/**
 * `AdminOrder` – mirrors a single row from the `orders` Supabase table.
 *
 * RLS note: this type is used only inside admin views where the caller must
 * have an admin role.  Regular users cannot read other users' orders.
 *
 * বাংলা: `orders` টেবিলের একটি সারির ডেটা স্ট্রাকচার।
 */
export interface AdminOrder {
  /** UUID primary key. */
  id: string;
  /** Auth user ID; null for guest orders. */
  user_id: string | null;
  /** Order grand total in BDT (৳). */
  total: number;
  /** Lifecycle status: pending | processing | shipped | delivered | cancelled */
  status: string;
  /** Street / flat address for shipping. */
  shipping_address: string;
  /** City / thana for shipping. */
  shipping_city: string;
  /** Mobile number used for delivery contact. */
  shipping_phone: string;
  /** Optional internal admin notes. */
  notes: string | null;
  /** ISO-8601 creation timestamp. */
  created_at: string;
  /** Email address for guest checkout (nullable). */
  guest_email: string | null;
  /** Display name for guest checkout (nullable). */
  guest_name: string | null;
  /** True when the order was placed without a registered account. */
  is_guest: boolean;
  /** Payment method: "cod" | "bkash" | "nagad" | etc. */
  payment_method: string;
  /** Payment status: "unpaid" | "pending_verification" | "partially_paid" | "paid" | "verified" */
  payment_status: string;
  /** Mobile-banking transaction ID supplied by customer (nullable). */
  transaction_id: string | null;
  /** Amount already paid / advanced (BDT). */
  advance_amount: number;
  /** Outstanding balance still owed (BDT). */
  due_amount: number;
  /** Phone number used for mobile payment (nullable). */
  payment_phone: string | null;
  /** True once an admin has manually verified the payment. */
  payment_verified: boolean;
  /** ISO-8601 timestamp of payment verification (nullable). */
  payment_verified_at: string | null;
  /** True once COD cash has been physically collected. */
  cod_collected: boolean;
  /** ISO-8601 timestamp of COD collection (nullable). */
  cod_collected_at: string | null;
  /** Courier tracking parcel number (nullable). */
  tracking_number: string | null;
  /** Courier company name, e.g. "Pathao", "Steadfast" (nullable). */
  courier_name: string | null;
  /** Human-readable estimated delivery date string (nullable). */
  estimated_delivery: string | null;
}

/**
 * `AdminOrderItem` – mirrors a single row from the `order_items` table.
 *
 * Supabase shape: select("product_name, quantity, price, size, color")
 * RLS note: admin-only via parent order's RLS policy.
 */
export interface AdminOrderItem {
  /** UUID primary key. */
  id: string;
  /** Snapshot of the product name at time of purchase. */
  product_name: string;
  /** Number of units ordered. */
  quantity: number;
  /** Per-unit price in BDT at time of purchase. */
  price: number;
  /** Selected size variant (nullable). */
  size: string | null;
  /** Selected colour variant (nullable). */
  color: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * `ORDER_STATUS_OPTIONS` – exhaustive readonly tuple of valid order statuses.
 * Used to populate status-change dropdowns and bulk-action selects.
 *
 * বাংলা: অর্ডারের সম্ভাব্য সব স্ট্যাটাস লিস্ট।
 */
export const ORDER_STATUS_OPTIONS = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

// ---------------------------------------------------------------------------
// Badge colour helpers
// ---------------------------------------------------------------------------

/**
 * `getStatusColor` – returns a Tailwind CSS class string for an order-status
 * badge background and text colour.
 *
 * @param status – order lifecycle status string
 * @returns Tailwind class string, e.g. `"bg-yellow-100 text-yellow-800"`
 *
 * Fallback: muted gray for any unknown/future status values.
 *
 * বাংলা: অর্ডার স্ট্যাটাস ব্যাজের রঙ নির্ধারণ করে।
 */
export const getStatusColor = (status: string) => {
  switch (status) {
    case "pending":    return "bg-yellow-100 text-yellow-800";
    case "processing": return "bg-blue-100 text-blue-800";
    case "shipped":    return "bg-purple-100 text-purple-800";
    case "delivered":  return "bg-green-100 text-green-800";
    case "cancelled":  return "bg-red-100 text-red-800";
    default:           return "bg-gray-100 text-gray-800";
  }
};

/**
 * `getPaymentStatusColor` – returns a Tailwind CSS class string for a
 * payment-status badge background and text colour.
 *
 * @param status – payment status string from `orders.payment_status`
 * @returns Tailwind class string
 *
 * Covers: "paid", "verified", "partially_paid", "pending_verification",
 *         "unpaid".  Falls back to muted for unknown values.
 *
 * বাংলা: পেমেন্ট স্ট্যাটাস ব্যাজের রঙ নির্ধারণ করে।
 */
export const getPaymentStatusColor = (status: string) => {
  switch (status) {
    case "paid":
    case "verified":
      return "bg-green-100 text-green-800";
    case "partially_paid":        return "bg-blue-100 text-blue-800";
    case "pending_verification":  return "bg-yellow-100 text-yellow-800";
    case "unpaid":                return "bg-red-100 text-red-800";
    default:                      return "bg-muted text-muted-foreground";
  }
};

// ---------------------------------------------------------------------------
// Print helper
// ---------------------------------------------------------------------------

/**
 * `printShippingLabel` – opens a new browser window containing a formatted
 * shipping label for the given order and immediately triggers the print dialog.
 *
 * The label includes:
 *   • Store name ("Dubai Borka House")
 *   • Recipient name, address, city, phone
 *   • Short order ID (first 8 chars, uppercased)
 *   • COD amount in BDT
 *   • Courier name and tracking number (if present)
 *   • Monospace barcode-style order ID footer
 *
 * Returns early (no-op) if `window.open` is blocked by the browser.
 *
 * @param order – the full `AdminOrder` object to print a label for
 *
 * বাংলা: একটি নতুন উইন্ডোতে শিপিং লেবেল প্রিন্ট করে।
 */
export const printShippingLabel = (order: AdminOrder) => {
  const win = window.open("", "_blank");
  if (!win) return;
  // Short ID for label display (first 8 hex chars, uppercase)
  const short = order.id.slice(0, 8).toUpperCase();
  win.document.write(`
    <html><head><title>Shipping Label - #${short}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      .label { border: 2px solid #000; padding: 20px; max-width: 400px; margin: auto; }
      .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
      .field { margin: 8px 0; }
      .field strong { display: inline-block; width: 80px; }
      .barcode { text-align: center; font-family: monospace; font-size: 24px; letter-spacing: 4px; margin-top: 15px; border-top: 2px solid #000; padding-top: 10px; }
      @media print { body { padding: 0; } }
    </style></head><body>
    <div class="label">
      <div class="header">
        <h2 style="margin:0">Dubai Borka House</h2>
        <p style="margin:4px 0;font-size:12px">Premium Fashion</p>
      </div>
      <div class="field"><strong>To:</strong> ${order.guest_name || "Customer"}</div>
      <div class="field"><strong>Address:</strong> ${order.shipping_address}</div>
      <div class="field"><strong>City:</strong> ${order.shipping_city}</div>
      <div class="field"><strong>Phone:</strong> ${order.shipping_phone}</div>
      <div class="field"><strong>Order:</strong> #${short}</div>
      <div class="field"><strong>COD:</strong> ৳${Number(order.total).toLocaleString()}</div>
      ${order.courier_name ? `<div class="field"><strong>Courier:</strong> ${order.courier_name}</div>` : ""}
      ${order.tracking_number ? `<div class="field"><strong>Tracking:</strong> ${order.tracking_number}</div>` : ""}
      <div class="barcode">#${short}</div>
    </div>
    <script>window.print();</script>
    </body></html>
  `);
  win.document.close();
};

// ---------------------------------------------------------------------------
// CSV export helper
// ---------------------------------------------------------------------------

/**
 * `exportOrdersCSV` – serialises an array of orders to a UTF-8 BOM-prefixed
 * CSV file and triggers a browser download.
 *
 * The BOM (`\uFEFF`) ensures Microsoft Excel opens the file with correct
 * UTF-8 encoding without a manual import wizard.
 *
 * Columns exported (in order):
 *   Order ID, Date, Customer, Phone, City, Address, Total,
 *   Status, Payment Method, Payment Status, Tracking, Courier, Notes
 *
 * Address and Notes fields are double-quoted and internal quotes are escaped
 * (`""`) to handle commas and newlines inside those values.
 *
 * The download filename uses today's ISO date: `orders-YYYY-MM-DD.csv`
 *
 * @param orders – array of `AdminOrder` objects to export
 *
 * বাংলা: অর্ডার লিস্ট CSV ফাইল হিসেবে ডাউনলোড করে।
 * Excel-এ সঠিক বাংলা দেখাতে BOM যোগ করা হয়েছে।
 */
export const exportOrdersCSV = (orders: AdminOrder[]) => {
  const headers = [
    "Order ID", "Date", "Customer", "Phone", "City", "Address", "Total",
    "Status", "Payment Method", "Payment Status", "Tracking", "Courier", "Notes",
  ];
  const rows = orders.map((o) => [
    o.id.slice(0, 8),
    new Date(o.created_at).toLocaleDateString(),
    o.guest_name || "",
    o.shipping_phone,
    o.shipping_city,
    // Wrap address in quotes; escape any existing quotes with double-quote
    `"${(o.shipping_address || "").replace(/"/g, '""')}"`,
    o.total,
    o.status,
    o.payment_method,
    o.payment_status,
    o.tracking_number || "",
    o.courier_name || "",
    `"${(o.notes || "").replace(/"/g, '""')}"`,
  ]);
  // \uFEFF = UTF-8 BOM; required for Excel to auto-detect encoding
  const csv = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url); // release object URL memory immediately after click
};
