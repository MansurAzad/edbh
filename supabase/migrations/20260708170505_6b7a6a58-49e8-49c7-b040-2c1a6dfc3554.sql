
ALTER TABLE public.whatsapp_share_events
  ADD COLUMN IF NOT EXISTS wa_message_id text,
  ADD COLUMN IF NOT EXISTS delivery_status text CHECK (delivery_status IN ('pending','sent','delivered','read','failed')),
  ADD COLUMN IF NOT EXISTS delivery_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_variant text DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS payload_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_wa_events_wa_message_id ON public.whatsapp_share_events(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_events_order_created ON public.whatsapp_share_events(order_id, created_at DESC);

-- Ensure service_role can write delivery updates from the webhook
GRANT ALL ON public.whatsapp_share_events TO service_role;

-- Enable realtime for live delivery status updates in admin views
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_share_events;
