/**
 * @file order-placement.ts
 * @description Client-side API contract for submitting a new order.
 *
 * Responsibilities:
 *  1. Serialise checkout state into the shape expected by the `create-order`
 *     Supabase Edge Function.
 *  2. Normalise error responses (edge function HTTP errors, Supabase relay
 *     errors, and plain `.message` strings) into a single Bengali-localised
 *     user-facing message.
 *  3. Fire-and-forget the order-confirmation e-mail via `send-order-notification`
 *     *after* `placeOrder` resolves, so a mail-delivery failure never blocks the
 *     checkout flow.
 *
 * **Edge function contract — `create-order`**
 * ```
 * POST body (JSON)
 * {
 *   items: { product_id, quantity, size, color }[],
 *   shippingInfo: { fullName, phone, email?, address, city?, district? },
 *   selectedZoneId: string | null,
 *   deliveryNotes: string,
 *   selectedPayment: "bkash" | "nagad" | "advance_cod" | "cod",
 *   transactionId: string,    // "" when not applicable
 *   paymentPhone: string,     // "" when not applicable
 *   advancePaymentMethod?: "bkash" | "nagad",
 *   advanceAmount: number | null,
 *   appliedCoupon: { id, code } | null,
 * }
 *
 * 200 response
 * {
 *   success: true,
 *   orderId: string,
 *   finalTotal: number,
 *   notification?: NotificationPayload,  // present when email should be sent
 * }
 *
 * 4xx/5xx response body
 * { error: string }   // user-facing Bengali message
 * ```
 *
 * Cross-module assumptions:
 *  - `CheckoutItemInput.product_id` must reference a row in `products`.
 *  - `selectedZoneId` null means "no delivery zone selected" — the edge
 *    function uses a default free-shipping zone in that case.
 *  - Coupon validation is performed server-side; the client only forwards the
 *    coupon id + code for audit.
 */
import { supabase } from "@/integrations/supabase/client";

/** Supported payment methods at checkout. */
type PaymentMethod = "bkash" | "nagad" | "advance_cod" | "cod";

/**
 * Advance-payment sub-methods used when `selectedPayment === "advance_cod"`.
 * The customer pays a partial amount upfront via one of these providers.
 */
type AdvancePaymentMethod = "bkash" | "nagad";

/** A single cart line item forwarded to the order edge function. */
interface CheckoutItemInput {
  product_id: string;
  quantity: number;
  /** Size variant selected by the customer (`null` for no-size products). */
  size: string | null;
  /** Colour variant selected by the customer (`null` for no-colour products). */
  color: string | null;
}

/**
 * Customer shipping details collected during checkout.
 * All fields except `email`, `city`, and `district` are required by the edge
 * function; optional fields default to empty strings server-side.
 */
interface CheckoutShippingInfoInput {
  fullName: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  district?: string;
}

/** Minimal coupon reference forwarded to the server for validation + audit. */
interface AppliedCouponInput {
  id: string;
  code: string;
}

/**
 * Payload forwarded fire-and-forget to the `send-order-notification` edge
 * function after a successful order creation.
 */
interface NotificationPayload {
  email: string;
  orderId: string;
  customerName: string;
  status: string;
  total: number;
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
 * Successful response shape returned by {@link placeOrder}.
 *
 * - `orderId`   – UUID of the newly created order row.
 * - `finalTotal`– Server-computed total (after coupon, shipping zone etc).
 *                 Callers should display this, not their local cart total.
 * - `notification` – Present only when the edge function wants the client to
 *                    trigger a confirmation e-mail (omitted for guest orders
 *                    without an email address).
 */
interface CreateOrderResponse {
  success: boolean;
  orderId: string;
  finalTotal: number;
  notification?: NotificationPayload;
}

/** All parameters required to submit a checkout. */
interface PlaceOrderParams {
  items: CheckoutItemInput[];
  shippingInfo: CheckoutShippingInfoInput;
  /** Delivery zone UUID from the `delivery_zones` table, or `null`. */
  selectedZoneId: string | null;
  deliveryNotes?: string;
  selectedPayment: PaymentMethod;
  /** Mobile-banking transaction reference (bKash / Nagad). Empty string otherwise. */
  transactionId?: string;
  /** Customer's payment phone number for bKash/Nagad verification. */
  paymentPhone?: string;
  advancePaymentMethod?: AdvancePaymentMethod;
  /** Advance amount in BDT. Only present for `advance_cod` orders. */
  advanceAmount?: number | null;
  /** Applied coupon details to be validated server-side. */
  appliedCoupon?: AppliedCouponInput | null;
}

/**
 * Fallback user-facing error message shown when the edge function does not
 * return a structured error payload.
 * Bengali: "অর্ডার দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।"
 *         ("There was a problem placing your order. Please try again.")
 */
const DEFAULT_ORDER_ERROR = "অর্ডার দিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।";

/**
 * Extracts a human-readable error message from the various error shapes that
 * Supabase's `functions.invoke` can produce:
 *
 *  1. `FunctionsHttpError` — has a `context: Response` with a JSON body
 *     `{ error: string }`. We clone + parse it to read the message.
 *  2. `FunctionsRelayError` / `FunctionsFetchError` — expose `.message` directly.
 *  3. Standard `Error` — `.message`.
 *  4. Anything else — falls back to `DEFAULT_ORDER_ERROR`.
 *
 * @param error - The raw value from the Supabase `error` field.
 * @returns     A user-facing, Bengali-localised error string.
 * @internal
 */
const getFunctionErrorMessage = async (error: unknown): Promise<string> => {
  if (error && typeof error === "object") {
    const maybeError = error as {
      context?: unknown;
      details?: unknown;
      message?: unknown;
    };

    // Shape 1: FunctionsHttpError — context is the raw Response object
    if (maybeError.context instanceof Response) {
      try {
        const payload = await maybeError.context.clone().json();
        if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
          return payload.error;
        }
      } catch {
        // JSON parse failed — fall through to next check
      }
    }

    // Shape 2: plain Error or relay error with a .message property
    if (typeof maybeError.message === "string" && maybeError.message.trim()) {
      return maybeError.message;
    }

    // Shape 3: some Supabase errors expose .details
    if (typeof maybeError.details === "string" && maybeError.details.trim()) {
      return maybeError.details;
    }
  }

  return DEFAULT_ORDER_ERROR;
};

/**
 * Submits a checkout to the `create-order` Supabase Edge Function and returns
 * the confirmed order details.
 *
 * **Flow**:
 * 1. Serialise params and call `create-order`.
 * 2. On error → normalise via `getFunctionErrorMessage` and **throw** so the
 *    calling mutation/hook can catch and display the message.
 * 3. On success with a `notification` email → fire-and-forget
 *    `send-order-notification` (never awaited; errors are only logged).
 * 4. Return `CreateOrderResponse` to the caller.
 *
 * **Throws**: `Error` with a user-facing Bengali message on any failure.
 * The caller (typically a React Query `useMutation`) should display
 * `error.message` directly.
 *
 * @param params - Checkout payload. See {@link PlaceOrderParams} for details.
 * @returns      Confirmed order details including server-computed `finalTotal`.
 *
 * @example
 * try {
 *   const { orderId, finalTotal } = await placeOrder({ items, shippingInfo, ... });
 * } catch (e) {
 *   toast.error((e as Error).message); // already Bengali-localised
 * }
 */
export const placeOrder = async ({
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
}: PlaceOrderParams): Promise<CreateOrderResponse> => {
  const { data, error } = await supabase.functions.invoke<CreateOrderResponse>("create-order", {
    body: {
      items: items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        size: item.size,
        color: item.color,
      })),
      shippingInfo,
      selectedZoneId,
      // Normalise undefined → "" so the edge function schema validator is happy
      deliveryNotes: deliveryNotes || "",
      selectedPayment,
      transactionId: transactionId || "",
      paymentPhone: paymentPhone || "",
      advancePaymentMethod,
      advanceAmount: advanceAmount ?? null,
      // Only forward id + code; other coupon fields are re-validated server-side
      appliedCoupon: appliedCoupon ? { id: appliedCoupon.id, code: appliedCoupon.code } : null,
    },
  });

  if (error) {
    // Await the async message extractor before throwing
    throw new Error(await getFunctionErrorMessage(error));
  }

  // Guard: edge function returned 200 but without an orderId — treat as error
  if (!data?.orderId) {
    throw new Error(DEFAULT_ORDER_ERROR);
  }

  if (data.notification?.email) {
    // Fire-and-forget: don't block the user on email delivery.
    // If this fails, the order is already created — no rollback needed.
    void supabase.functions
      .invoke("send-order-notification", { body: data.notification })
      .catch((notificationError) => {
        console.error("Order notification error:", notificationError);
      });
  }

  return data;
};
