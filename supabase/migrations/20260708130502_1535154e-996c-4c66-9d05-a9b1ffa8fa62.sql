
CREATE TABLE public.security_scan_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL DEFAULT 'production' UNIQUE,
  rules jsonb NOT NULL DEFAULT '{
    "keywords": ["kinghorsetoto","slot gacor","judi bola","fastoto","intertogel","royaltoto","98toto","situs togel","prediksi togel","casino online","sbobet","pkv games"],
    "tags": ["script","iframe","object","embed"],
    "uri_schemes": ["javascript:","data:text/html","vbscript:"],
    "hidden_css": ["display:none","visibility:hidden","font-size:0","opacity:0"],
    "sensitivity": "high"
  }'::jsonb,
  csp_retention_days integer NOT NULL DEFAULT 90,
  scan_retention_days integer NOT NULL DEFAULT 180,
  alerts jsonb NOT NULL DEFAULT '{
    "email_enabled": false,
    "email_to": null,
    "slack_enabled": false,
    "slack_webhook_url": null,
    "webhook_enabled": false,
    "webhook_url": null,
    "spike_threshold": 20,
    "spike_window_minutes": 60,
    "alert_on_critical": true
  }'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.security_scan_settings TO authenticated;
GRANT ALL ON public.security_scan_settings TO service_role;
ALTER TABLE public.security_scan_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read scan settings" ON public.security_scan_settings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins write scan settings" ON public.security_scan_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update scan settings" ON public.security_scan_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.security_scan_settings (environment) VALUES ('production') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.cleanup_security_data()
RETURNS TABLE(csp_deleted bigint, scan_deleted bigint, block_deleted bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  s record;
  csp_n bigint := 0;
  scan_n bigint := 0;
  block_n bigint := 0;
BEGIN
  SELECT csp_retention_days, scan_retention_days INTO s
  FROM public.security_scan_settings ORDER BY updated_at DESC LIMIT 1;
  IF s IS NULL THEN
    s.csp_retention_days := 90;
    s.scan_retention_days := 180;
  END IF;

  WITH d AS (DELETE FROM public.csp_reports WHERE created_at < now() - (s.csp_retention_days || ' days')::interval RETURNING 1)
  SELECT count(*) INTO csp_n FROM d;
  WITH d AS (DELETE FROM public.security_scan_reports WHERE created_at < now() - (s.scan_retention_days || ' days')::interval RETURNING 1)
  SELECT count(*) INTO scan_n FROM d;
  WITH d AS (DELETE FROM public.injection_block_log WHERE created_at < now() - (s.scan_retention_days || ' days')::interval RETURNING 1)
  SELECT count(*) INTO block_n FROM d;

  RETURN QUERY SELECT csp_n, scan_n, block_n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cleanup_security_data() TO service_role;

DO $$ BEGIN
  PERFORM cron.unschedule('daily-security-cleanup');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'daily-security-cleanup',
  '0 4 * * *',
  $$ SELECT public.cleanup_security_data(); $$
);
