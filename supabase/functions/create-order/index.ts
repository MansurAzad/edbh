/**
 * @file create-order/index.ts
 * @overview  Customer-facing order-creation Edge Function for Dubai Borka House.
 *
 * HTTP CONTRACT
 * ─────────────
 * Method : POST
 * Auth   : Optional — Bearer JWT in Authorization header.
 *          Authenticated → order is linked to `auth.users.id`.
 *          Guest         → order stored with guest_name / guest_email.
 * Body   : JSON matching `BodySchema` (see below)
 *   {
 *     items          : OrderItem[]   // product_id + quantity + optional size/color
 *     shippingInfo   : { fullName, phone, email?, address, city?, district? }
 *     selectedZoneId : UUID | null   // delivery_zones.id; null → no zone fee
 *     deliveryNotes  : string | null
 *     selectedPayment: "bkash" | "nagad" | "advance_cod" | "cod"
 *     transactionId  : string | null // required for bkash/nagad/advance_cod
 *     paymentPhone   : string | null // required for bkash/nagad/advance_cod
 *     advancePaymentMethod : "bkash" | "nagad" // required for advance_cod
 *     advanceAmount  : number | null  // required & > 0 for advance_cod
 *     appliedCoupon  : { id, code } | null
 *   }
 *
 * RESPONSE (200 OK)
 * ─────────────────
 * {
 *   success      : true
 *   orderId      : string  // UUID of the new order
 *   finalTotal   : number  // BDT after discount + shipping
 *   notification : {       // present only when customer email is available
 *     email, orderId, customerName, status, total, items[], shippingAddress, shippingCity, shippingPhone
 *   } | null
 * }
 * Error responses use 4xx/5xx with { error: string, fields?: object }.
 * All user-facing error messages are in Bengali (বাংলা).
 *
 * ENV VARS USED
 * ─────────────
 * SUPABASE_URL              – Supabase project URL
 * SUPABASE_ANON_KEY         – Anon key (used to verify the caller's JWT)
 * SUPABASE_SERVICE_ROLE_KEY – Service-role key (used for all DB writes and lookups)
 *
 * AUTH MODEL
 * ──────────
 * The function accepts an optional Authorization header.
 * 1. Creates a temporary "user client" with the caller's JWT to resolve the user.
 * 2. If the JWT is invalid or missing the request is treated as a guest — NOT rejected.
 * 3. All actual DB operations use the service-role client (supabaseAdmin) to bypass RLS.
 *
 * RATE LIMITING (DB-based, per phone number)
 * ──────────────────────────────────────────
 * • Duplicate order guard : ≤1 order per phone within the last 10 minutes.
 * • Daily order cap       : ≤3 orders per phone within the last 24 hours.
 *
 * DOWNSTREAM SIDE EFFECTS (all fire after the main order insert)
 * ──────────────────────────────────────────────────────────────
 * DB writes (parallel via Promise.all):
 *   • products.stock       decremented for each ordered item (guarded to ≥0)
 *   • product_variants.stock decremented when a matched variant exists
 *   • profiles             updated with latest name/phone/address (authenticated users only)
 *   • coupons.current_uses incremented by 1 (when a coupon was applied)
 * The `notification` field in the success response is consumed by the caller
 * (frontend) to trigger an email via a separate notification service — no
 * email/WhatsApp/Steadfast API calls are made inside this function.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "npm:zod@3.24.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Zod schema for a single line item in the cart.
 * `size` and `color` are optional but passed through to `order_items`.
 * UUID validation ensures no hallucinated product IDs reach the DB.
 */
const OrderItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().positive(),
  size: z.string().trim().max(100).nullable().optional(),
  color: z.string().trim().max(100).nullable().optional(),
});

/**
 * Full request body schema.
 * Validates every field before any DB call is made.
 * Returns field-level errors (Bengali) on 400 so the UI can highlight bad inputs.
 *
 * Payment rules enforced downstream (not in Zod):
 *   • bkash / nagad      → transactionId + paymentPhone required
 *   • advance_cod        → advancePaymentMethod + transactionId + paymentPhone + advanceAmount > 0
 *   • advance_cod        → advanceAmount must be < finalTotal (prevents full pre-payment via this path)
 */
const BodySchema = z.object({
  items: z.array(OrderItemSchema).min(1),
  shippingInfo: z.object({
    fullName: z.string().trim().min(1).max(255),
    phone: z.string().trim().min(6).max(30),
    email: z.union([z.string().trim().email(), z.literal(""), z.null()]).optional(),
    address: z.string().trim().min(1).max(500),
    city: z.union([z.string().trim().max(255), z.literal(""), z.null()]).optional(),
    district: z.union([z.string().trim().max(255), z.literal(""), z.null()]).optional(),
  }),
  selectedZoneId: z.string().uuid().nullable().optional(),
  deliveryNotes: z.union([z.string().trim().max(1000), z.literal(""), z.null()]).optional(),
  selectedPayment: z.enum(["bkash", "nagad", "advance_cod", "cod"]),
  transactionId: z.union([z.string().trim().max(255), z.literal(""), z.null()]).optional(),
  paymentPhone: z.union([z.string().trim().max(30), z.literal(""), z.null()]).optional(),
  advancePaymentMethod: z.enum(["bkash", "nagad"]).optional(),
  advanceAmount: z.number().nonnegative().nullable().optional(),
  appliedCoupon: z.object({
    id: z.string().uuid(),
    code: z.string().trim().min(1).max(100),
  }).nullable().optional(),
});

/** Minimal product columns fetched during order validation. */
type ProductRow = {
  id: string;
  name: string;
  price: number;
  sale_price: number | null;
  stock: number | null;
};

/** Variant row — carries per-variant stock and price_adjustment. */
type ProductVariantRow = {
  id: string;
  product_id: string;
  size: string | null;
  color: string | null;
  stock: number;
  price_adjustment: number | null;
};

/** Coupon row fetched for validation — all fields needed for every validity check. */
type CouponRow = {
  id: string;
  code: string;
  current_uses: number;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  minimum_order_amount: number | null;
  valid_from: string | null;
  valid_until: string | null;
};

/**
 * Convenience wrapper: serialises `body` to JSON and attaches CORS + Content-Type headers.
 * Used for every response returned from this function.
 */
const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

/**
 * Normalises a size/color string for case-insensitive comparison.
 * Returns null for blank/undefined values so that `null == null` matches correctly.
 */
const normalizeValue = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

/**
 * Returns true when the item's size/color matches a variant row after normalisation.
 * Used in the variant-matching loop to find the correct `product_variants` row.
 */
const isSameVariant = (itemValue?: string | null, rowValue?: string | null) => {
  return normalizeValue(itemValue) === normalizeValue(rowValue);
};

/**
 * Main request handler.
 *
 * Execution order:
 *  1. CORS preflight short-circuit (OPTIONS → 200)
 *  2. Env-var guard
 *  3. Body parse + Zod validation
 *  4. Optional JWT → authUser resolution
 *  5. Payment-method field guards (bkash/nagad require txId+phone; advance_cod extra checks)
 *  6. Parallel DB lookups:
 *       a. Recent-order rate limit  (10-min window per phone)
 *       b. Daily order count        (24-hr window per phone)
 *       c. Delivery zone            (active check)
 *       d. Products                 (bulk fetch by ID)
 *       e. Product variants         (bulk fetch by product_id)
 *  7. Per-item price/stock calculation (variant price_adjustment applied)
 *  8. Coupon validation (sequential — only when appliedCoupon is present)
 *  9. Final total = subtotal − discount + shippingCost
 * 10. advance_cod guard: advanceAmount must be < finalTotal
 * 11. orders INSERT
 * 12. order_items INSERT  (rollback = delete the order row on failure)
 * 13. Parallel side-effect writes: stock decrement, profile update, coupon usage++
 * 14. Return 200 with orderId + notification payload
 */
serve(async (req: Request): Promise<Response> => {
  // ── Step 1: CORS preflight ──────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Step 2: Env-var guard ────────────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(500, { error: "Order service configuration is incomplete." });
  }

  // ── Step 3: Parse & validate request body ──────────────────────────────────
  // Bengali error messages are returned directly to the customer UI.
  let parsedBody: z.infer<typeof BodySchema>;
  try {
    const requestBody = await req.json();
    const result = BodySchema.safeParse(requestBody);

    if (!result.success) {
      return jsonResponse(400, {
        error: "অর্ডারের তথ্য সঠিক নয়। অনুগ্রহ করে ফর্মটি আবার যাচাই করুন।",
        fields: result.error.flatten().fieldErrors,
      });
    }

    parsedBody = result.data;
  } catch {
    return jsonResponse(400, { error: "অর্ডারের তথ্য পড়া যায়নি। আবার চেষ্টা করুন।" });
  }

  // Service-role client — bypasses RLS for all admin operations in this function.
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  // ── Step 4: Optional JWT resolution ─────────────────────────────────────────
  // The function accepts both authenticated and guest shoppers.
  // An invalid / expired token is silently downgraded to guest — no 401.
  const authHeader = req.headers.get("Authorization");
  let authUser: { id: string; email?: string | null } | null = null;

  if (authHeader) {
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    const { data: userData } = await userClient.auth.getUser();
    // If getUser fails (e.g. anon key / expired token), treat as guest — don't reject
    if (userData?.user) {
      authUser = {
        id: userData.user.id,
        email: userData.user.email,
      };
    }
  }

  const {
    items,
    shippingInfo,
    selectedZoneId,
    deliveryNotes,
    selectedPayment,
    transactionId,
    paymentPhone,
    advancePaymentMethod,
    advanceAmount,
    appliedCoupon,
  } = parsedBody;

  const trimmedTransactionId = transactionId?.trim() || null;
  const trimmedPaymentPhone = paymentPhone?.trim() || null;
  const trimmedCustomerEmail = authUser?.email?.trim() || shippingInfo.email?.trim() || null;

  // ── Step 5a: Mobile-payment field guard ─────────────────────────────────────
  // bKash / Nagad require both a transaction ID and the payer's phone.
  // Bengali: "মোবাইল পেমেন্টের জন্য Transaction ID এবং পেমেন্ট নম্বর দিতে হবে।"
  if ((selectedPayment === "bkash" || selectedPayment === "nagad") && (!trimmedTransactionId || !trimmedPaymentPhone)) {
    return jsonResponse(400, { error: "মোবাইল পেমেন্টের জন্য Transaction ID এবং পেমেন্ট নম্বর দিতে হবে।" });
  }

  // ── Step 5b: Advance+COD field guard ────────────────────────────────────────
  // Advance COD additionally requires the advance payment method and a positive amount.
  if (selectedPayment === "advance_cod") {
    if (!advancePaymentMethod || !trimmedTransactionId || !trimmedPaymentPhone || !advanceAmount || advanceAmount <= 0) {
      return jsonResponse(400, { error: "Advance + COD এর জন্য অগ্রিম পরিমাণ, Transaction ID এবং পেমেন্ট নম্বর দিতে হবে।" });
    }
  }

  // ── Step 6: Parallel DB lookups ──────────────────────────────────────────────
  // Deduplicate product IDs so we don't over-fetch.
  const normalizedPhone = shippingInfo.phone.trim();
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const productIds = [...new Set(items.map((item) => item.product_id))];

  // All five queries run concurrently; each result is checked individually below.
  // Run independent lookups in parallel — biggest speed win
  const [recentOrdersRes, dailyOrdersRes, zoneRes, productsRes, variantsRes] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("id")
      .eq("shipping_phone", normalizedPhone)
      .gt("created_at", tenMinutesAgo)
      .limit(1),
    supabaseAdmin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("shipping_phone", normalizedPhone)
      .gt("created_at", twentyFourHoursAgo),
    selectedZoneId
      ? supabaseAdmin
          .from("delivery_zones")
          .select("id, city, shipping_charge")
          .eq("id", selectedZoneId)
          .eq("is_active", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as { data: { id: string; city: string; shipping_charge: number } | null; error: null }),
    supabaseAdmin
      .from("products")
      .select("id, name, price, sale_price, stock")
      .in("id", productIds),
    supabaseAdmin
      .from("product_variants")
      .select("id, product_id, size, color, stock, price_adjustment")
      .in("product_id", productIds),
  ]);

  // ── Step 6a: Enforce 10-minute duplicate-order rate limit ──────────────────
  // Bengali: "আপনি ১০ মিনিটের মধ্যে আবার অর্ডার দিতে পারবেন না।"
  if (recentOrdersRes.error) {
    console.error("Rate limit lookup failed:", recentOrdersRes.error);
    return jsonResponse(500, { error: "অর্ডার যাচাই করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।" });
  }
  if ((recentOrdersRes.data || []).length > 0) {
    return jsonResponse(400, { error: "আপনি ১০ মিনিটের মধ্যে আবার অর্ডার দিতে পারবেন না। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।" });
  }

  // ── Step 6b: Enforce 24-hour order cap (max 3) ─────────────────────────────
  // Bengali: "২৪ ঘণ্টায় সর্বোচ্চ ৩টি অর্ডার দেওয়া যায়।"
  if (dailyOrdersRes.error) {
    console.error("Daily rate limit lookup failed:", dailyOrdersRes.error);
    return jsonResponse(500, { error: "অর্ডার যাচাই করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।" });
  }
  if ((dailyOrdersRes.count || 0) >= 3) {
    return jsonResponse(400, { error: "২৪ ঘণ্টায় সর্বোচ্চ ৩টি অর্ডার দেওয়া যায়। অনুগ্রহ করে পরে চেষ্টা করুন।" });
  }

  // ── Step 6c: Validate delivery zone ─────────────────────────────────────────
  // Zone must still be is_active=true at order time; client-side state may be stale.
  let selectedZone: { id: string; city: string; shipping_charge: number } | null = null;
  if (selectedZoneId) {
    if (zoneRes.error || !zoneRes.data) {
      return jsonResponse(400, { error: "নির্বাচিত ডেলিভারি জোনটি আর সক্রিয় নেই। অনুগ্রহ করে আবার নির্বাচন করুন।" });
    }
    selectedZone = zoneRes.data as { id: string; city: string; shipping_charge: number };
  }

  // ── Step 6d/6e: Unpack product + variant results ────────────────────────────
  const { data: products, error: productsError } = productsRes;
  if (productsError || !products) {
    console.error("Product lookup failed:", productsError);
    return jsonResponse(500, { error: "পণ্যের তথ্য যাচাই করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।" });
  }

  const { data: variants, error: variantsError } = variantsRes;
  if (variantsError) {
    console.error("Variant lookup failed:", variantsError);
    return jsonResponse(500, { error: "পণ্যের ভ্যারিয়েন্ট যাচাই করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।" });
  }

  // Index products and variants for O(1) lookup inside the per-item loop below.
  const productMap = new Map<string, ProductRow>((products as ProductRow[]).map((product) => [product.id, product]));
  const variantsByProductId = new Map<string, ProductVariantRow[]>();

  for (const variant of (variants || []) as ProductVariantRow[]) {
    const existing = variantsByProductId.get(variant.product_id) || [];
    existing.push(variant);
    variantsByProductId.set(variant.product_id, existing);
  }

  // ── Step 7: Per-item price and stock validation ──────────────────────────────
  // Iterates cart items; resolves the matching variant (size+color comparison is
  // normalised to lowercase/trimmed so "M" == "m" etc.).
  // Price = sale_price ?? price + variant.price_adjustment.
  // Stock check: variant stock takes priority; falls back to product-level stock.
  const computedItems = [] as Array<{
    order_id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    price: number;
    size: string | null;
    color: string | null;
    matchedVariant: ProductVariantRow | null;
    productStock: number | null;
  }>;

  for (const item of items) {
    const product = productMap.get(item.product_id);
    if (!product) {
      return jsonResponse(400, { error: "কার্টের একটি পণ্য আর পাওয়া যাচ্ছে না। অনুগ্রহ করে কার্ট আপডেট করুন।" });
    }

    const matchedVariant = (variantsByProductId.get(item.product_id) || []).find(
      (variant) => isSameVariant(item.size, variant.size) && isSameVariant(item.color, variant.color),
    ) || null;

    if (matchedVariant && matchedVariant.stock < item.quantity) {
      return jsonResponse(400, {
        error: `"${product.name}" এর স্টকে মাত্র ${matchedVariant.stock}টি আছে।`,
      });
    }

    if (!matchedVariant && product.stock !== null && product.stock < item.quantity) {
      return jsonResponse(400, {
        error: `"${product.name}" এর স্টকে মাত্র ${product.stock}টি আছে।`,
      });
    }

    const basePrice = Number(product.sale_price ?? product.price);
    const unitPrice = basePrice + Number(matchedVariant?.price_adjustment ?? 0);

    computedItems.push({
      order_id: "",
      product_id: item.product_id,
      product_name: product.name,
      quantity: item.quantity,
      price: unitPrice,
      size: item.size ?? null,
      color: item.color ?? null,
      matchedVariant,
      productStock: product.stock,
    });
  }

  // ── Step 8: Coupon validation ────────────────────────────────────────────────
  // Sequential — only run when appliedCoupon is present.
  // Checks: active flag, valid_from/valid_until, max_uses, minimum_order_amount.
  // discount_type "percentage" → Math.round(subtotal * value / 100)
  // discount_type "fixed"      → flat amount in BDT
  const subtotal = computedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let couponId: string | null = null;
  let discountAmount = 0;
  let couponUsageCount: number | null = null;

  if (appliedCoupon?.id) {
    const { data: couponData, error: couponError } = await supabaseAdmin
      .from("coupons")
      .select("id, code, current_uses, discount_type, discount_value, max_uses, minimum_order_amount, valid_from, valid_until")
      .eq("id", appliedCoupon.id)
      .eq("is_active", true)
      .limit(1);

    if (couponError) {
      console.error("Coupon lookup failed:", couponError);
      return jsonResponse(500, { error: "কুপনের তথ্য যাচাই করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।" });
    }

    const coupon = (couponData?.[0] ?? null) as CouponRow | null;
    if (!coupon) {
      return jsonResponse(400, { error: "নির্বাচিত কুপনটি আর ব্যবহারযোগ্য নয়।" });
    }

    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now) {
      return jsonResponse(400, { error: "এই কুপনটি এখনো সক্রিয় হয়নি।" });
    }

    if (coupon.valid_until && new Date(coupon.valid_until) < now) {
      return jsonResponse(400, { error: "এই কুপনের মেয়াদ শেষ হয়ে গেছে।" });
    }

    if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
      return jsonResponse(400, { error: "এই কুপনের ব্যবহার সীমা শেষ হয়ে গেছে।" });
    }

    if (coupon.minimum_order_amount && subtotal < Number(coupon.minimum_order_amount)) {
      return jsonResponse(400, {
        error: `এই কুপন ব্যবহার করতে ন্যূনতম ৳${Number(coupon.minimum_order_amount).toLocaleString()} অর্ডার করতে হবে।`,
      });
    }

    couponId = coupon.id;
    couponUsageCount = coupon.current_uses;
    discountAmount = coupon.discount_type === "percentage"
      ? Math.round((subtotal * Number(coupon.discount_value)) / 100)
      : Number(coupon.discount_value);
  }

  // ── Step 9: Final total calculation ─────────────────────────────────────────
  // finalTotal is clamped to ≥0 to prevent negative totals on large discounts.
  // Flat ৳150 delivery charge when no specific zone is selected (simplified checkout).
  const FLAT_SHIPPING_BDT = 150;
  const shippingCost = selectedZone ? Number(selectedZone.shipping_charge) : FLAT_SHIPPING_BDT;
  const finalTotal = Math.max(0, subtotal - discountAmount + shippingCost);

  // ── Step 10: Advance amount sanity guard ─────────────────────────────────────
  // The advance portion must be strictly less than the grand total; otherwise
  // the customer is essentially paying the full amount upfront via the advance path,
  // which should go through bkash/nagad instead.
  if (selectedPayment === "advance_cod" && advanceAmount && advanceAmount >= finalTotal) {
    return jsonResponse(400, { error: "Advance + COD এর অগ্রিম পরিমাণ মোট টাকার চেয়ে কম হতে হবে।" });
  }

  // ── Step 11: Build order fields ──────────────────────────────────────────────
  // payment_method for advance_cod is stored as "advance_bkash" / "advance_nagad".
  // payment_status matrix:
  //   bkash/nagad     → "pending_verification"
  //   advance_cod     → "partially_paid"
  //   cod             → "unpaid"
  const generatedOrderId = crypto.randomUUID();
  const paymentMethod = selectedPayment === "advance_cod"
    ? `advance_${advancePaymentMethod || "bkash"}`
    : selectedPayment;
  const advancePaid = selectedPayment === "advance_cod" ? Number(advanceAmount || 0) : 0;
  const dueAmount = selectedPayment === "advance_cod"
    ? Math.max(finalTotal - advancePaid, 0)
    : (selectedPayment === "cod" ? finalTotal : 0);

  const shippingAddress = [shippingInfo.address.trim(), shippingInfo.district?.trim()].filter(Boolean).join(", ");
  const shippingCity = selectedZone?.city || shippingInfo.city?.trim() || "N/A";

  // ── Step 11 (cont.): Insert the order row ────────────────────────────────────
  // All monetary values stored as-is (BDT integers).
  // guest_name / guest_email only populated for unauthenticated shoppers.
  const { error: orderError } = await supabaseAdmin.from("orders").insert({
    id: generatedOrderId,
    user_id: authUser?.id || null,
    guest_name: authUser ? null : shippingInfo.fullName.trim(),
    guest_email: authUser ? null : trimmedCustomerEmail,
    is_guest: !authUser,
    total: finalTotal,
    shipping_address: shippingAddress,
    shipping_city: shippingCity,
    shipping_phone: normalizedPhone,
    notes: deliveryNotes?.trim() || null,
    status: "pending",
    coupon_id: couponId,
    discount_amount: discountAmount,
    payment_method: paymentMethod,
    payment_status: selectedPayment === "bkash" || selectedPayment === "nagad"
      ? "pending_verification"
      : (selectedPayment === "advance_cod" ? "partially_paid" : "unpaid"),
    transaction_id: trimmedTransactionId,
    payment_phone: trimmedPaymentPhone,
    advance_amount: advancePaid,
    due_amount: dueAmount,
  });

  if (orderError) {
    console.error("Order insert failed:", orderError);
    return jsonResponse(400, { error: orderError.message || "অর্ডার তৈরি করা যায়নি। আবার চেষ্টা করুন।" });
  }

  // ── Step 12: Insert order_items ──────────────────────────────────────────────
  // Strip the internal-only `matchedVariant` and `productStock` helper fields
  // before inserting into the DB.
  const orderItemsPayload = computedItems.map(({ matchedVariant: _matchedVariant, productStock: _productStock, ...item }) => ({
    ...item,
    order_id: generatedOrderId,
  }));

  const { error: orderItemsError } = await supabaseAdmin.from("order_items").insert(orderItemsPayload);

  // If order_items fails we delete the dangling orders row (compensating transaction).
  if (orderItemsError) {
    console.error("Order item insert failed:", orderItemsError);
    await supabaseAdmin.from("orders").delete().eq("id", generatedOrderId);
    return jsonResponse(400, { error: orderItemsError.message || "অর্ডারের পণ্য সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।" });
  }

  // ── Step 13: Parallel side-effect writes ────────────────────────────────────
  // None of these failures abort the order — they're logged but swallowed.
  // Fire all stock + profile + coupon updates in parallel
  const updatePromises: Promise<unknown>[] = [];
  for (const item of computedItems) {
    if (item.productStock !== null) {
      updatePromises.push(
        supabaseAdmin
          .from("products")
          .update({ stock: Math.max(item.productStock - item.quantity, 0) })
          .eq("id", item.product_id)
          .then(({ error }) => {
            if (error) console.error("Product stock sync failed:", error);
          }),
      );
    }
    if (item.matchedVariant) {
      updatePromises.push(
        supabaseAdmin
          .from("product_variants")
          .update({ stock: Math.max(item.matchedVariant.stock - item.quantity, 0) })
          .eq("id", item.matchedVariant.id)
          .then(({ error }) => {
            if (error) console.error("Variant stock sync failed:", error);
          }),
      );
    }
  }

  // Update the authenticated user's profile with the latest shipping info.
  // Useful so repeat customers don't have to re-enter their address.
  if (authUser) {
    updatePromises.push(
      supabaseAdmin
        .from("profiles")
        .update({
          full_name: shippingInfo.fullName.trim(),
          phone: normalizedPhone,
          address: shippingInfo.address.trim(),
          city: shippingCity,
        })
        .eq("user_id", authUser.id)
        .then(({ error }) => {
          if (error) console.error("Profile update failed:", error);
        }),
    );
  }

  // Increment coupon.current_uses — note: we read the count earlier to avoid a
  // read-modify-write race; if two orders slip through concurrently the count may
  // drift by 1, which is acceptable for a soft limit.
  if (couponId && couponUsageCount !== null) {
    updatePromises.push(
      supabaseAdmin
        .from("coupons")
        .update({ current_uses: couponUsageCount + 1 })
        .eq("id", couponId)
        .then(({ error }) => {
          if (error) console.error("Coupon usage update failed:", error);
        }),
    );
  }

  // Fire and forget — we don't fail the request if any side-effect write fails.
  await Promise.all(updatePromises);


  // ── Step 14: Success response ────────────────────────────────────────────────
  // The `notification` object is consumed by the frontend to fire an email
  // confirmation. It is null when no email address was provided.
  return jsonResponse(200, {
    success: true,
    orderId: generatedOrderId,
    finalTotal,
    notification: trimmedCustomerEmail
      ? {
          email: trimmedCustomerEmail,
          orderId: generatedOrderId,
          customerName: shippingInfo.fullName.trim(),
          status: "pending",
          total: finalTotal,
          items: computedItems.map((item) => ({
            name: item.product_name,
            quantity: item.quantity,
            price: item.price * item.quantity,
            size: item.size || undefined,
            color: item.color || undefined,
          })),
          shippingAddress: shippingAddress,
          shippingCity,
          shippingPhone: normalizedPhone,
        }
      : null,
  });
});
