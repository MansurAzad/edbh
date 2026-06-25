/**
 * @file generate-invoice/index.ts
 *
 * @purpose
 *   Generates a formatted A4 PDF invoice for a given order using the jsPDF
 *   library and streams it as a binary download.  The invoice includes:
 *   store branding, invoice number (INV-{first8ofOrderId}), bill-to details,
 *   order status/payment summary, a line-item table with alternating row
 *   shading, subtotal/discount/shipping/grand total breakdown, and advance-paid
 *   / due-on-delivery figures for advance+COD orders.
 *
 * @http
 *   Method : POST  (OPTIONS also handled)
 *   Body   : { orderId: string }
 *
 * @response
 *   200 OK : Content-Type: application/pdf
 *            Content-Disposition: attachment; filename="INV-{SHORT_ID}.pdf"
 *            Body: raw PDF bytes (ArrayBuffer)
 *   500    : { error: string }  (JSON, Content-Type: application/json)
 *
 * @auth
 *   None enforced — relies on the caller passing a valid orderId that exists.
 *   In practice, only called from the authenticated admin order-detail page.
 *   Uses the service-role key internally.
 *
 * @env
 *   SUPABASE_URL              – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY – Required for DB access
 *
 * @sideEffects
 *   Read-only — queries:
 *     - `orders` (with nested `order_items` join) by `id`
 *     - `profiles` by `user_id` (only for registered-user orders; guest
 *       orders use `orders.guest_name` instead)
 *   No writes to the database.
 *
 * @layout
 *   Gold accent colour: RGB(212,175,55)
 *   Fonts  : jsPDF built-in (Helvetica)
 *   Columns: # | Product | Qty | Unit Price | Total
 *   Shipping is back-calculated: total - subtotal + discount_amount
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId } = await req.json();

    if (!orderId) {
      throw new Error("Order ID is required");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("*, order_items (*)")
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      throw new Error("Order not found");
    }

    let customerName = order.guest_name || "Customer";
    if (order.user_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", order.user_id)
        .single();
      if (profile?.full_name) customerName = profile.full_name;
    }

    const invoiceNumber = `INV-${order.id.slice(0, 8).toUpperCase()}`;
    const orderDate = new Date(order.created_at).toLocaleDateString("en-GB");

    // Generate PDF using jsPDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Header
    doc.setFontSize(24);
    doc.setTextColor(212, 175, 55); // Gold
    doc.text("Dubai Borka House", margin, y);
    y += 8;
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text("Premium Fashion", margin, y);
    y += 5;
    doc.text("123 Fashion Street, Gulshan, Dhaka", margin, y);

    // Invoice title
    doc.setFontSize(28);
    doc.setTextColor(50, 50, 50);
    doc.text("INVOICE", pageWidth - margin, 20, { align: "right" });
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(invoiceNumber, pageWidth - margin, 30, { align: "right" });
    doc.text(`Date: ${orderDate}`, pageWidth - margin, 37, { align: "right" });

    // Divider
    y = 55;
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 15;

    // Bill To & Order Info
    doc.setFontSize(11);
    doc.setTextColor(212, 175, 55);
    doc.text("Bill To:", margin, y);
    doc.text("Order Info:", pageWidth / 2 + 10, y);
    y += 7;

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text(customerName, margin, y);
    doc.text(`Order ID: #${order.id.slice(0, 8).toUpperCase()}`, pageWidth / 2 + 10, y);
    y += 6;
    doc.text(order.shipping_address || "", margin, y);
    doc.text(`Status: ${order.status}`, pageWidth / 2 + 10, y);
    y += 6;
    doc.text(order.shipping_city || "", margin, y);
    doc.text(`Payment: ${order.payment_method || "COD"}`, pageWidth / 2 + 10, y);
    y += 6;
    doc.text(`Phone: ${order.shipping_phone || ""}`, margin, y);
    y += 15;

    // Table Header
    const colX = [margin, margin + 12, margin + 95, margin + 120, margin + 148];
    doc.setFillColor(212, 175, 55);
    doc.rect(margin, y - 5, pageWidth - margin * 2, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text("#", colX[0], y + 1);
    doc.text("Product", colX[1], y + 1);
    doc.text("Qty", colX[2], y + 1);
    doc.text("Unit Price", colX[3], y + 1);
    doc.text("Total", colX[4], y + 1);
    y += 12;

    // Table Rows
    doc.setTextColor(50, 50, 50);
    const items = order.order_items || [];
    items.forEach((item: any, i: number) => {
      const itemName = `${item.product_name}${item.size ? ` (${item.size})` : ""}${item.color ? ` - ${item.color}` : ""}`;
      const lineTotal = Number(item.price) * item.quantity;

      // Alternate row bg
      if (i % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, y - 5, pageWidth - margin * 2, 9, "F");
      }

      doc.text(`${i + 1}`, colX[0], y);
      // Truncate long names
      const truncName = itemName.length > 40 ? itemName.slice(0, 37) + "..." : itemName;
      doc.text(truncName, colX[1], y);
      doc.text(`${item.quantity}`, colX[2], y);
      doc.text(`BDT ${Number(item.price).toLocaleString()}`, colX[3], y);
      doc.text(`BDT ${lineTotal.toLocaleString()}`, colX[4], y);
      y += 9;
    });

    // Totals
    y += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);

    const subtotal = items.reduce((sum: number, item: any) => sum + Number(item.price) * item.quantity, 0);
    doc.text("Subtotal:", pageWidth - margin - 60, y);
    doc.text(`BDT ${subtotal.toLocaleString()}`, pageWidth - margin, y, { align: "right" });
    y += 7;

    if (order.discount_amount && Number(order.discount_amount) > 0) {
      doc.setTextColor(0, 150, 0);
      doc.text("Discount:", pageWidth - margin - 60, y);
      doc.text(`-BDT ${Number(order.discount_amount).toLocaleString()}`, pageWidth - margin, y, { align: "right" });
      y += 7;
    }

    const shippingCost = Number(order.total) - subtotal + (Number(order.discount_amount) || 0);
    if (shippingCost > 0) {
      doc.setTextColor(100, 100, 100);
      doc.text("Shipping:", pageWidth - margin - 60, y);
      doc.text(`BDT ${shippingCost.toLocaleString()}`, pageWidth - margin, y, { align: "right" });
      y += 7;
    }

    // Grand Total
    y += 3;
    doc.setFontSize(14);
    doc.setTextColor(212, 175, 55);
    doc.text("Grand Total:", pageWidth - margin - 60, y);
    doc.text(`BDT ${Number(order.total).toLocaleString()}`, pageWidth - margin, y, { align: "right" });

    // Advance/Due info for advance+COD
    if (order.advance_amount && Number(order.advance_amount) > 0) {
      y += 10;
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`Advance Paid: BDT ${Number(order.advance_amount).toLocaleString()}`, pageWidth - margin - 60, y);
      y += 6;
      doc.text(`Due on Delivery: BDT ${Number(order.due_amount || 0).toLocaleString()}`, pageWidth - margin - 60, y);
    }

    // Footer
    y = doc.internal.pageSize.getHeight() - 30;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("Thank you for shopping with Dubai Borka House!", pageWidth / 2, y, { align: "center" });
    y += 5;
    doc.text("© 2025 Dubai Borka House. All rights reserved.", pageWidth / 2, y, { align: "center" });

    // Generate PDF as ArrayBuffer
    const pdfOutput = doc.output("arraybuffer");

    return new Response(pdfOutput, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoiceNumber}.pdf"`,
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error generating invoice:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
