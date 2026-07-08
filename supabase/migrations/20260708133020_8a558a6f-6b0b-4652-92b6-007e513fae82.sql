
-- Add schedule config to security_scan_settings
ALTER TABLE public.security_scan_settings
  ADD COLUMN IF NOT EXISTS schedule jsonb NOT NULL DEFAULT '{"enabled": true, "frequency_hours": 24, "last_run_at": null}'::jsonb;

-- Ensure environment column has default
ALTER TABLE public.security_scan_settings
  ALTER COLUMN environment SET DEFAULT 'production';

-- Add progress/error/updated_at to scan reports
ALTER TABLE public.security_scan_reports
  ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Admin audit log
CREATE TABLE IF NOT EXISTS public.security_admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  category text NOT NULL,
  environment text,
  before jsonb,
  after jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.security_admin_audit_log TO authenticated;
GRANT ALL ON public.security_admin_audit_log TO service_role;

ALTER TABLE public.security_admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON public.security_admin_audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert audit log"
  ON public.security_admin_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_sec_audit_created_at ON public.security_admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sec_audit_category ON public.security_admin_audit_log(category);

-- Trigger: log settings changes
CREATE OR REPLACE FUNCTION public.log_security_settings_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.security_admin_audit_log(actor, action, category, environment, before, after, metadata)
  VALUES (
    auth.uid(),
    CASE
      WHEN OLD.rules IS DISTINCT FROM NEW.rules THEN 'update_rules'
      WHEN OLD.alerts IS DISTINCT FROM NEW.alerts THEN 'update_alerts'
      WHEN OLD.schedule IS DISTINCT FROM NEW.schedule THEN 'update_schedule'
      WHEN OLD.csp_retention_days IS DISTINCT FROM NEW.csp_retention_days
        OR OLD.scan_retention_days IS DISTINCT FROM NEW.scan_retention_days THEN 'update_retention'
      ELSE 'update_settings'
    END,
    'settings',
    NEW.environment,
    jsonb_build_object('rules', OLD.rules, 'alerts', OLD.alerts, 'schedule', OLD.schedule,
      'csp_retention_days', OLD.csp_retention_days, 'scan_retention_days', OLD.scan_retention_days),
    jsonb_build_object('rules', NEW.rules, 'alerts', NEW.alerts, 'schedule', NEW.schedule,
      'csp_retention_days', NEW.csp_retention_days, 'scan_retention_days', NEW.scan_retention_days),
    '{}'::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_security_settings_change ON public.security_scan_settings;
CREATE TRIGGER trg_log_security_settings_change
  AFTER UPDATE ON public.security_scan_settings
  FOR EACH ROW
  WHEN (OLD.rules IS DISTINCT FROM NEW.rules
     OR OLD.alerts IS DISTINCT FROM NEW.alerts
     OR OLD.schedule IS DISTINCT FROM NEW.schedule
     OR OLD.csp_retention_days IS DISTINCT FROM NEW.csp_retention_days
     OR OLD.scan_retention_days IS DISTINCT FROM NEW.scan_retention_days)
  EXECUTE FUNCTION public.log_security_settings_change();

-- Helper: pick most recent settings id (used by scheduler)
CREATE OR REPLACE FUNCTION public.security_scan_is_due(_settings_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((s.schedule->>'enabled')::boolean, false)
    AND (
      s.schedule->>'last_run_at' IS NULL
      OR (s.schedule->>'last_run_at')::timestamptz
         < now() - (COALESCE((s.schedule->>'frequency_hours')::int, 24) || ' hours')::interval
    )
  FROM public.security_scan_settings s
  WHERE s.id = _settings_id;
$$;
