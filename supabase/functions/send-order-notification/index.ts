/**
 * @file send-order-notification/index.ts
 *
 * @purpose
 *   Sends a status-update email to the customer whenever an order's status
 *   changes (pending → confirmed → processing → shipped → delivered/cancelled).
 *   Uses the Resend npm SDK (v2). All status labels are rendered in Bengali.
 *
 * @httpContract
 *   Method  : POST
 *   Auth    : None enforced (called by trusted server-side order-update flows)
 *   Body    : `OrderNotificationRequest`
 *   ```json
 *   {
 *     "email": "user@example.com",
 *     "orderId": "<uuid>",
 *     "customerName": "Jane",
 *     "status": "shipped",
 *     "total": 1500,
 *     "items": [{ "name": "Abaya", "quantity": 1, "price": 1500, "size": "54" }],
 *     "shippingAddress": "123 Main St",
 *     "shippingCity": "Dhaka",
 *     "shippingPhone": "01700000000"
 *   }
 *   ```
 *   Response 200: `{ "success": true, "emailResponse": <ResendResponse> }`
 *   Response 500: `{ "error": "<message>" }`
 *
 * @envVars
 *   - `RESEND_API_KEY` — Resend API key (required; passed to the `Resend` SDK constructor).
 *
 * @authModel
 *   No JWT verification. Restrict invocation to trusted internal callers.
 *
 * @thirdPartyAPIs
 *   Resend SDK (npm:resend@2.0.0) — wraps https://api.resend.com/emails
 *   - `resend.emails.send({ from, to, subject, html })`
 *   - Throws on non-2xx responses.
 *
 * @emailTemplate
 *   From    : "Dubai Borka House <noreply@dubaiborkehouse.com>"
 *   Subject : "অর্ডার আপডেট: {statusBangla} - #{shortId}"
 *             (Bengali: "Order Update: {status} - #{shortId}")
 *   Design  : gold-gradient header, colour-coded status banner, Bengali item
 *             table headers (পণ্য=Product, পরিমাণ=Quantity, মূল্য=Price),
 *             delivery address block, dark footer.
 *
 * @statusMap (Bengali translations)
 *   pending   → অপেক্ষমাণ        (Waiting)
 *   confirmed → নিশ্চিত করা হয়েছে (Confirmed)
 *   processing→ প্রসেসিং চলছে     (Processing)
 *   shipped   → শিপ করা হয়েছে    (Shipped)
 *   delivered → ডেলিভারি সম্পন্ন  (Delivered)
 *   cancelled → বাতিল করা হয়েছে  (Cancelled)
 *
 * @idempotency
 *   Not idempotent — duplicate calls send duplicate emails.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

// Initialise Resend SDK once at cold-start with the API key from env
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Expected POST body fields for an order status notification. */
interface OrderNotificationRequest {
  email: string;
  orderId: string;
  customerName: string;
  status: string;      // Internal status key (e.g. "shipped")
  total: number;       // Grand total in BDT
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    size?: string;
    color?: string;
  }>;
  shippingAddress: string;
  shippingCity: string;
  shippingPhone: string;
}

/**
 * Map internal order status keys to their Bengali equivalents.
 * Fallback: return the raw status string if not in the map.
 *
 * @param status - Internal status string (e.g. `"shipped"`).
 * @returns Bengali label (e.g. `"শিপ করা হয়েছে"`).
 */
const getStatusBangla = (status: string): string => {
  const statusMap: Record<string, string> = {
    pending:    "অপেক্ষমাণ",           // Waiting
    confirmed:  "নিশ্চিত করা হয়েছে",   // Confirmed
    processing: "প্রসেসিং চলছে",        // Processing
    shipped:    "শিপ করা হয়েছে",       // Shipped
    delivered:  "ডেলিভারি সম্পন্ন",    // Delivered
    cancelled:  "বাতিল করা হয়েছে",     // Cancelled
  };
  return statusMap[status] || status;
};

/**
 * Map internal order status keys to CSS colour codes used in the status banner.
 *
 * @param status - Internal status string.
 * @returns Hex colour string (e.g. `"#10B981"` for shipped/green).
 */
const getStatusColor = (status: string): string => {
  const colorMap: Record<string, string> = {
    pending:    "#FFA500", // amber
    confirmed:  "#3B82F6", // blue
    processing: "#8B5CF6", // purple
    shipped:    "#10B981", // emerald
    delivered:  "#22C55E", // green
    cancelled:  "#EF4444", // red
  };
  return colorMap[status] || "#6B7280"; // default grey
};

/** Main Deno.serve handler. */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Parse request ──────────────────────────────────────────────────────
    const {
      email, orderId, customerName, status, total,
      items, shippingAddress, shippingCity, shippingPhone,
    }: OrderNotificationRequest = await req.json();

    if (!email || !orderId) {
      throw new Error("Missing required fields: email and orderId");
    }

    const statusBangla = getStatusBangla(status);
    const statusColor  = getStatusColor(status);

    // ── Build item rows ────────────────────────────────────────────────────
    // Bengali column headers: পণ্য=Product, পরিমাণ=Qty, মূল্য=Price
    const itemsHtml = items
      .map(
        (item) => `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e5e5;">
            ${item.name}
            ${item.size  ? `<br><small style="color: #666;">Size: ${item.size}</small>` : ""}
            ${item.color ? `<small style="color: #666;"> | Color: ${item.color}</small>` : ""}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">৳${item.price.toLocaleString()}</td>
        </tr>
      `
      )
      .join("");

    // ── HTML template ──────────────────────────────────────────────────────
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Gold-gradient header -->
          <div style="background: linear-gradient(135deg, #D4AF37 0%, #B8860B 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Dubai Borka House</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 14px;">Premium Fashion</p>
          </div>
          
          <!-- Colour-coded status banner (colour varies by status) -->
          <div style="background-color: ${statusColor}; padding: 20px; text-align: center;">
            <!-- Bengali: "Order Status: {statusBangla}" -->
            <h2 style="color: #ffffff; margin: 0; font-size: 20px;">
              অর্ডার স্ট্যাটাস: ${statusBangla}
            </h2>
          </div>
          
          <div style="padding: 30px;">
            <!-- Bengali greeting: "Dear {customerName}," -->
            <p style="font-size: 16px; color: #333;">প্রিয় ${customerName},</p>
            <!-- Bengali: "Your order #{shortId} status has been updated." -->
            <p style="font-size: 14px; color: #666; line-height: 1.6;">
              আপনার অর্ডার #${orderId.slice(0, 8).toUpperCase()} এর স্ট্যাটাস আপডেট হয়েছে।
            </p>
            
            <!-- Bengali: "Order Details" -->
            <div style="background-color: #f9f9f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">অর্ডার বিবরণ</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="background-color: #e5e5e5;">
                    <!-- পণ্য=Product, পরিমাণ=Quantity, মূল্য=Price -->
                    <th style="padding: 12px; text-align: left; font-size: 14px;">পণ্য</th>
                    <th style="padding: 12px; text-align: center; font-size: 14px;">পরিমাণ</th>
                    <th style="padding: 12px; text-align: right; font-size: 14px;">মূল্য</th>
                  </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
                <tfoot>
                  <tr>
                    <!-- মোট = Total -->
                    <td colspan="2" style="padding: 12px; text-align: right; font-weight: bold;">মোট:</td>
                    <td style="padding: 12px; text-align: right; font-weight: bold; color: #D4AF37;">৳${total.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            <!-- ডেলিভারি ঠিকানা = Delivery Address -->
            <div style="background-color: #fff8e1; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">ডেলিভারি ঠিকানা</h3>
              <p style="margin: 5px 0; color: #666; font-size: 14px;">${shippingAddress}</p>
              <p style="margin: 5px 0; color: #666; font-size: 14px;">${shippingCity}</p>
              <p style="margin: 5px 0; color: #666; font-size: 14px;">📞 ${shippingPhone}</p>
            </div>
            
            <!-- Bengali: "If you have questions, please contact us." -->
            <p style="font-size: 14px; color: #666; line-height: 1.6;">
              কোনো প্রশ্ন থাকলে আমাদের সাথে যোগাযোগ করুন।
            </p>
            <!-- Bengali: "Thank you, Dubai Borka House Team" -->
            <p style="font-size: 14px; color: #333; margin-top: 30px;">
              ধন্যবাদ,<br>
              <strong>Dubai Borka House Team</strong>
            </p>
          </div>
          
          <!-- Dark footer -->
          <div style="background-color: #333; padding: 20px; text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 0;">
              © 2024 Dubai Borka House. All rights reserved.
            </p>
            <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">
              123 Fashion Street, Gulshan, Dhaka, Bangladesh
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    // ── Send via Resend SDK ────────────────────────────────────────────────
    // Subject in Bengali: "Order Update: {statusBangla} - #{shortId}"
    const emailResponse = await resend.emails.send({
      from: "Dubai Borka House <noreply@dubaiborkehouse.com>",
      to: [email],
      subject: `অর্ডার আপডেট: ${statusBangla} - #${orderId.slice(0, 8).toUpperCase()}`,
      html: emailHtml,
    });

    console.log("Order notification email sent:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending order notification:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
