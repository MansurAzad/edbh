/** Domain types + presentational helpers shared by Orders admin views. */

export interface AdminOrder {
  id: string;
  user_id: string | null;
  total: number;
  status: string;
  shipping_address: string;
  shipping_city: string;
  shipping_phone: string;
  notes: string | null;
  created_at: string;
  guest_email: string | null;
  guest_name: string | null;
  is_guest: boolean;
  payment_method: string;
  payment_status: string;
  transaction_id: string | null;
  advance_amount: number;
  due_amount: number;
  payment_phone: string | null;
  payment_verified: boolean;
  payment_verified_at: string | null;
  cod_collected: boolean;
  cod_collected_at: string | null;
  tracking_number: string | null;
  courier_name: string | null;
  estimated_delivery: string | null;
}

export interface AdminOrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price: number;
  size: string | null;
  color: string | null;
}

export const ORDER_STATUS_OPTIONS = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export const getStatusColor = (status: string) => {
  switch (status) {
    case "pending": return "bg-yellow-100 text-yellow-800";
    case "processing": return "bg-blue-100 text-blue-800";
    case "shipped": return "bg-purple-100 text-purple-800";
    case "delivered": return "bg-green-100 text-green-800";
    case "cancelled": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

export const getPaymentStatusColor = (status: string) => {
  switch (status) {
    case "paid":
    case "verified":
      return "bg-green-100 text-green-800";
    case "partially_paid": return "bg-blue-100 text-blue-800";
    case "pending_verification": return "bg-yellow-100 text-yellow-800";
    case "unpaid": return "bg-red-100 text-red-800";
    default: return "bg-muted text-muted-foreground";
  }
};

/** Open a printable shipping-label window for one order. */
export const printShippingLabel = (order: AdminOrder) => {
  const win = window.open("", "_blank");
  if (!win) return;
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

/** Download the given orders as CSV (BOM-prefixed for Excel UTF-8). */
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
    `"${(o.shipping_address || "").replace(/"/g, '""')}"`,
    o.total,
    o.status,
    o.payment_method,
    o.payment_status,
    o.tracking_number || "",
    o.courier_name || "",
    `"${(o.notes || "").replace(/"/g, '""')}"`,
  ]);
  const csv = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
