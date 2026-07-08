
# Simplified Checkout Plan

## Goal
Make the Cart → Checkout flow as short as possible: only **Name, Mobile, Full Address**. Fixed **৳150** shipping. Two payment options only. After ordering, auto-share a WhatsApp message (with product image, size, name, address, phone, receipt link) to our business WhatsApp number. Order still lands correctly in the Admin dashboard.

## Scope
Frontend/UI only. No DB schema changes. Existing `placeOrder`, coupon logic, and admin Orders page remain untouched.

## Changes

### 1. Checkout UI (`src/pages/Checkout.tsx` + new `SimpleCheckoutForm.tsx`)
- Collapse 3-step wizard into a **single page**:
  - **Left column**: Name*, Mobile*, Full Address* (textarea), Delivery note (optional), Payment selector.
  - **Right column**: Existing `CheckoutOrderSummary` (coupon works as-is).
- Remove step indicator, ShippingStep, PaymentStep, ReviewStep from render (files kept for now, unused).
- Hide: City, District, Delivery Zone dropdown. Internally city="", district="", zone=null.
- Bottom: one big **"অর্ডার কনফার্ম করুন"** button.

### 2. Fixed Shipping ৳150
- In `Checkout.tsx`: replace `shippingCost = selectedZone?.shipping_charge ?? 0` with `const FLAT_SHIPPING = 150; const shippingCost = items.length ? FLAT_SHIPPING : 0;`
- `finalTotal = total - discountAmount + shippingCost` (coupon still applies to subtotal).
- Order summary shows "ডেলিভারি চার্জ: ৳১৫০ (ফিক্সড)".

### 3. Payment options — only two
- Show only `advance_cod` and `cod` cards. Hide bKash/Nagad/Card full-payment tiles.
- Default = `cod`.
- For `advance_cod`: keep existing TxID / phone / advance amount inputs inline.

### 4. Validation
- Remove zone requirement in `validateShippingInfo`.
- Keep: name, phone (BD 11-digit), address non-empty.

### 5. WhatsApp auto-share after order (new `src/lib/checkout/whatsappShare.ts`)
- On successful `placeOrder`:
  1. Build message (Bengali) with: order ID, customer name/phone/address, each item (name, size, color, qty, price, product image URL), subtotal, shipping ৳150, discount, total, payment method, advance/TxID if any, receipt/invoice link `${origin}/order-tracking?id=<orderId>`.
  2. `window.open('https://wa.me/8801845853634?text=' + encodeURIComponent(msg), '_blank')` — opens WhatsApp with pre-filled message to our business number (same number used in `WhatsAppOrderButton`).
- Product images are included as URLs in the message (WhatsApp auto-previews first URL). Full media attachment isn't possible via wa.me; URL preview is the standard pattern.
- Also show a "WhatsApp-এ শেয়ার করুন" button on `CheckoutSuccess` as fallback if popup blocked.

### 6. Success page
- `CheckoutSuccess` gets an extra prop `onShareWhatsApp` — button that re-triggers the share.

## Files
- **Edit**: `src/pages/Checkout.tsx`, `src/components/checkout/PaymentStep.tsx` (filter payment methods list) OR create new inline payment picker, `src/components/checkout/CheckoutSuccess.tsx`, `src/lib/checkout/types.ts` (only if payment list needs a "visible" flag — otherwise filter inline).
- **New**: `src/components/checkout/SimpleCheckoutForm.tsx`, `src/lib/checkout/whatsappShare.ts`.

## Out of scope
- No DB migration, no edge function, no changes to admin Orders page, no changes to existing `placeOrder`, coupon, or tracking logic.

## Verification
- Add to cart → /checkout → fill 3 fields → pick COD → confirm → order appears in Admin Orders + WhatsApp opens with full receipt message to 8801845853634.
