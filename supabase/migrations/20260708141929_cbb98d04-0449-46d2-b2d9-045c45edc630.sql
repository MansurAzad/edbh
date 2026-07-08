
CREATE TABLE public.whatsapp_share_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('opened','blocked','failed','retried')),
  error text,
  actor text NOT NULL DEFAULT 'customer' CHECK (actor IN ('customer','admin','system')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_share_events_order ON public.whatsapp_share_events(order_id, created_at DESC);

GRANT INSERT ON public.whatsapp_share_events TO anon, authenticated;
GRANT SELECT ON public.whatsapp_share_events TO authenticated;
GRANT ALL ON public.whatsapp_share_events TO service_role;

ALTER TABLE public.whatsapp_share_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can append share events"
  ON public.whatsapp_share_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (order_id IS NOT NULL);

CREATE POLICY "Admin or order owner can view events"
  ON public.whatsapp_share_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = whatsapp_share_events.order_id
        AND o.user_id = auth.uid()
    )
  );
