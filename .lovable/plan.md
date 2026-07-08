## Plan: WhatsApp share upgrade pack

### 1. Schema (migration)
Extend `whatsapp_share_events`:
- `wa_message_id text` — WhatsApp Business API message id
- `delivery_status text` — `pending | sent | delivered | read | failed`
- `delivery_updated_at timestamptz`
- `attempt_variant text` — `primary | fallback_short | fallback_plain`
- `payload_snapshot jsonb` — exact text + image URL sent

### 2. Payload builder (`src/lib/checkout/whatsappShare.ts`)
Rewrite `buildReceiptMessage`:
- Full customer name, mobile, complete address
- Per-item: name, **size**, color, qty, price
- Product image thumbnail URL (first image) as a linked line
- Order total, delivery charge
- Return `{ text, imageUrl, phone }`

### 3. Preview screen (`src/components/checkout/WhatsAppSharePreview.tsx`)
New Dialog shown before opening WhatsApp:
- Renders receipt text in monospace
- Shows product image thumbnails grid
- Buttons: "Send on WhatsApp" / "Copy text" / "Cancel"
- Wired from `FloatingCartSidebar` (auto-share) and `CheckoutSuccess` retry

### 4. WhatsApp Business Cloud API edge function
New `supabase/functions/whatsapp-send/index.ts`:
- POSTs to `graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages`
- Sends image + caption template
- Records `wa_message_id`, sets `delivery_status='sent'`
- Requires secrets: `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_ID`

New `supabase/functions/whatsapp-webhook/index.ts`:
- Meta webhook verify (GET) + status callback (POST)
- Updates `whatsapp_share_events` by `wa_message_id` → `delivered | read | failed`
- Public URL user pastes into Meta App dashboard

Frontend: two modes
- If `META_WHATSAPP_*` secrets present → Cloud API path (real delivery status)
- Else → existing `wa.me` click path (heuristic)

### 5. Retry escalation (`src/lib/admin/whatsappRetry.ts`)
On admin retry:
- Look up last attempt's `error_reason`
- If reason matches `blocked | rate_limited | template_rejected` → use `attempt_variant='fallback_short'` (trimmed template, no image caption)
- If still fails → `fallback_plain` (text-only, no links)
- Escalation ladder recorded in `attempt_variant`

### 6. Admin per-order history (`src/components/admin/orders/OrderWhatsAppHistory.tsx`)
Section inside `OrderDetailDialog`:
- Chronological timeline: timestamp, actor, status, delivery_status badge, error_reason, variant used
- "Retry" and "Retry with fallback" buttons
- Realtime subscribe to `whatsapp_share_events` for that order

### 7. Admin list polling
`WhatsAppShareEvents.tsx`: subscribe to realtime + 20s poll fallback so delivery status flips live.

### Secrets to request
- `META_WHATSAPP_TOKEN` (System User permanent token)
- `META_WHATSAPP_PHONE_ID`
- `META_WHATSAPP_VERIFY_TOKEN` (auto-generated)

### Files touched
Migration • `whatsappShare.ts` • `WhatsAppSharePreview.tsx` (new) • `FloatingCartSidebar.tsx` • `CheckoutSuccess.tsx` • `whatsappRetry.ts` • `OrderWhatsAppHistory.tsx` (new) • `OrderDetailDialog.tsx` • `WhatsAppShareEvents.tsx` • 2 edge functions • realtime enable for `whatsapp_share_events`

### Order of execution
1. Request Meta secrets (blocks Cloud API path)
2. Migration
3. Edge functions
4. Payload builder + preview modal
5. Retry escalation + admin history + realtime

Approve and I'll ship. If you don't have Meta WhatsApp Business API credentials yet, I can build everything except the Cloud API send/webhook now, then wire those in when you paste the token + phone id.
