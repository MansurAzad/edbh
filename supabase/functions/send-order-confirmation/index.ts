/**
 * @file send-order-confirmation/index.ts
 *
 * @purpose
 *   Sends a transactional order-confirmation email to the customer immediately
 *   after a new order is placed. The email contains a full itemised receipt,
 *   the shipping address, and a promise to notify again when shipped.
 *
 * @httpContract
 *   Method  : POST
 *   Auth    : None enforced (caller is trusted server-side code)
 *   Body    : `OrderConfirmationRequest` (see interface below)
 *   ```json
 *   {
 *     "orderId":         "<uuid>",
 *     "customerEmail":   "user@example.com",
 *     "customerName":    "Jane Doe",
 *     "orderTotal":      1500,
 *     "shippingAddress": "123 Main St",
 *     "shippingCity":    "Dhaka",
 *     "items": [
 *       { "name": "Abaya", "quantity": 1, "price": 1500, "size": "54", "color": "Black" }
 *     ]
 *   }
 *   ```
 *   Response 200 (success):
 *     `{ "success": true, "data": { "id": "<resend-message-id>" } }`
 *   Response 500 (any error):
 *     `{ "success": false, "error": "<message>" }`
 *
 * @envVars
 *   - `RESEND_API_KEY` — Resend transactional email API key (required).
 *     If absent the function throws immediately with a descriptive error.
 *
 * @authModel
 *   No JWT verification inside the function. It is invoked by the order-
 *   creation flow in the application layer, which is itself auth-gated.
 *
 * @thirdPartyAPIs
 *   Resend (https://api.resend.com/emails)
 *   - Method  : POST
 *   - Auth    : `Authorization: Bearer <RESEND_API_KEY>`
 *   - Payload : `{ from, to, subject, html }`
 *   - Success : 2xx → returns `{ id: string }`
 *   - Failure : non-2xx → response body text thrown as an Error
 *
 * @emailTemplate
 *   From    : "Dubai Borka House <orders@dubaiborkehouse.com>"
 *   Subject : "Order Confirmation - #<first-8-chars-of-orderId>"
 *   Design  : dark header (#1a1a1a) with gold (#D4AF37) branding,
 *             itemised table (name, size, color, qty, price in ৳),
 *             order total, shipping address, support email footer.
 *
 * @rateLimiting
 *   Single email per invocation — no batching concerns.
 *
 * @idempotency
 *   Not idempotent — repeated calls for the same `orderId` send duplicate
 *   emails. Deduplication must be handled by the caller (e.g. track email
 *   sent status on the order row).
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

/** Shape returned by Resend on a successful email send. */
interface ResendEmailResponse {
  id: string;
}

// Read the Resend key at module load time (once per function cold-start)
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

// CORS headers — allow browser-initiated calls from any origin
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Expected POST body shape for order-confirmation requests.
 *
 * @property orderId         - UUID of the order (first 8 chars shown in email).
 * @property customerEmail   - Recipient email address.
 * @property customerName    - Displayed in the greeting; falls back to "Valued Customer".
 * @property orderTotal      - Grand total in BDT (৳); displayed in the total row.
 * @property shippingAddress - Street/area portion of the delivery address.
 * @property shippingCity    - City portion of the delivery address.
 * @property items           - Line items — each rendered as a table row.
 */
interface OrderConfirmationRequest {
  orderId: string;
  customerEmail: string;
  customerName: string;
  orderTotal: number;
  shippingAddress: string;
  shippingCity: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    size?: string;   // Optional garment size (e.g. "54")
    color?: string;  // Optional colour variant
  }>;
}

/**
 * Send a single transactional email via Resend.
 *
 * @param to      - Recipient email address.
 * @param subject - Email subject line.
 * @param html    - Full HTML body of the email.
 * @throws {Error} if Resend returns a non-2xx status (includes response body in message).
 * @returns `{ id }` from Resend on success.
 */
async function sendEmail(to: string, subject: string, html: string): Promise<ResendEmailResponse> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Dubai Borka House <orders@dubaiborkehouse.com>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    // Capture Resend's error body for debugging before throwing
    const error = await response.text();
    throw new Error(`Failed to send email: ${error}`);
  }

  return response.json();
}

/** Main request handler — registered with `serve()` below. */
const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Guard: Resend key must exist before attempting any send
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    // ── Parse and destructure request body ────────────────────────────────
    const { 
      orderId, 
      customerEmail, 
      customerName, 
      orderTotal, 
      shippingAddress, 
      shippingCity,
      items 
    }: OrderConfirmationRequest = await req.json();

    // Validate required fields — email + orderId are the minimum we need
    if (!orderId || !customerEmail) {
      throw new Error("Missing required fields: orderId and customerEmail are required");
    }

    // ── Build items HTML table rows ────────────────────────────────────────
    // Each item renders name (with optional size/color sub-lines), qty, price in ৳
    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          ${item.name}
          ${item.size ? `<br><small style="color: #666;">Size: ${item.size}</small>` : ''}
          ${item.color ? `<br><small style="color: #666;">Color: ${item.color}</small>` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <!-- ৳ = Bangladeshi Taka symbol -->
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">৳${item.price.toLocaleString()}</td>
      </tr>
    `).join('');

    // ── Full HTML email template ───────────────────────────────────────────
    // Design: dark header (#1a1a1a) + gold accent (#D4AF37), white content card
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Order Confirmation</title>
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <!-- Brand header -->
        <div style="background-color: #1a1a1a; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="color: #D4AF37; margin: 0; font-size: 28px;">Dubai Borka House</h1>
          <p style="color: #888; margin: 10px 0 0;">Premium Fashion</p>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <h2 style="color: #1a1a1a; margin-top: 0;">Thank You for Your Order!</h2>
          
          <p style="color: #444;">Dear ${customerName || 'Valued Customer'},</p>
          
          <p style="color: #444;">We're excited to confirm that we've received your order. Here are the details:</p>
          
          <!-- Order ID block — only first 8 chars shown for brevity -->
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #666;">
              <strong>Order ID:</strong> 
              <span style="color: #D4AF37; font-family: monospace;">#${orderId.slice(0, 8).toUpperCase()}</span>
            </p>
          </div>
          
          <h3 style="color: #1a1a1a; border-bottom: 2px solid #D4AF37; padding-bottom: 10px;">Order Items</h3>
          
          <!-- Itemised order table -->
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="padding: 12px; text-align: left; color: #666;">Item</th>
                <th style="padding: 12px; text-align: center; color: #666;">Qty</th>
                <th style="padding: 12px; text-align: right; color: #666;">Price</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="padding: 15px 12px; text-align: right; font-weight: bold; color: #1a1a1a;">Total:</td>
                <!-- Grand total in ৳ (Bangladeshi Taka) -->
                <td style="padding: 15px 12px; text-align: right; font-weight: bold; color: #D4AF37; font-size: 18px;">৳${orderTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
          
          <h3 style="color: #1a1a1a; border-bottom: 2px solid #D4AF37; padding-bottom: 10px; margin-top: 30px;">Shipping Address</h3>
          <p style="color: #444; background-color: #f9f9f9; padding: 15px; border-radius: 8px;">
            ${shippingAddress}<br>
            ${shippingCity}
          </p>
          
          <!-- Shipping notification promise -->
          <div style="margin-top: 30px; padding: 20px; background-color: #1a1a1a; border-radius: 8px; text-align: center;">
            <p style="color: #fff; margin: 0;">We'll notify you when your order is shipped.</p>
            <p style="color: #D4AF37; margin: 10px 0 0;">Thank you for shopping with us!</p>
          </div>
          
          <p style="color: #888; font-size: 12px; margin-top: 30px; text-align: center;">
            If you have any questions, please contact us at support@dubaiborkahouse.com
          </p>
        </div>
      </body>
      </html>
    `;

    // ── Send via Resend ────────────────────────────────────────────────────
    const emailResponse = await sendEmail(
      customerEmail,
      `Order Confirmation - #${orderId.slice(0, 8).toUpperCase()}`,
      emailHtml
    );

    console.log("Order confirmation email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-order-confirmation function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
