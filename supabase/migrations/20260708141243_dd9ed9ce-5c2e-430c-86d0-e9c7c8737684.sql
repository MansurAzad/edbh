
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS whatsapp_share_status text,
  ADD COLUMN IF NOT EXISTS whatsapp_shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_share_error text;
