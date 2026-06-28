-- Ensure RLS + policy + index exist (table was created previously)
ALTER TABLE public.inventory_sync_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inventory_sync_audit_log'
      AND policyname = 'Admins can view inventory sync audit logs'
  ) THEN
    CREATE POLICY "Admins can view inventory sync audit logs"
      ON public.inventory_sync_audit_log FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

GRANT SELECT ON public.inventory_sync_audit_log TO authenticated;
GRANT ALL ON public.inventory_sync_audit_log TO service_role;

CREATE INDEX IF NOT EXISTS idx_inventory_sync_audit_created_at
  ON public.inventory_sync_audit_log (created_at DESC);

INSERT INTO public.system_settings (key, value)
VALUES
  ('inventory_webhook_url', '{"url": ""}'::jsonb),
  ('inventory_webhook_enabled', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;