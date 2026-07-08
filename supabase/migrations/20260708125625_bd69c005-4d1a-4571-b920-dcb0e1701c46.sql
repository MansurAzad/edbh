
-- ============ Security tables ============
CREATE TABLE public.csp_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_uri text,
  referrer text,
  violated_directive text,
  effective_directive text,
  original_policy text,
  blocked_uri text,
  status_code integer,
  source_file text,
  line_number integer,
  column_number integer,
  user_agent text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.csp_reports TO anon;
GRANT SELECT, INSERT ON public.csp_reports TO authenticated;
GRANT ALL ON public.csp_reports TO service_role;
ALTER TABLE public.csp_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert CSP reports"
  ON public.csp_reports FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY "Admins read CSP reports"
  ON public.csp_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.security_scan_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by text NOT NULL DEFAULT 'manual', -- manual | scheduled
  triggered_user uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'completed',
  total_findings integer NOT NULL DEFAULT 0,
  critical_count integer NOT NULL DEFAULT 0,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.security_scan_reports TO authenticated;
GRANT ALL ON public.security_scan_reports TO service_role;
ALTER TABLE public.security_scan_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read scan reports"
  ON public.security_scan_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.injection_block_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL, -- 'site_content' | 'product' | 'blog' | 'upload' | 'custom_html'
  reason text NOT NULL,
  matched_pattern text,
  actor uuid,
  payload_excerpt text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.injection_block_log TO authenticated;
GRANT ALL ON public.injection_block_log TO service_role;
ALTER TABLE public.injection_block_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read injection log"
  ON public.injection_block_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_csp_reports_created ON public.csp_reports(created_at DESC);
CREATE INDEX idx_scan_reports_created ON public.security_scan_reports(created_at DESC);
CREATE INDEX idx_injection_log_created ON public.injection_block_log(created_at DESC);

-- ============ Reusable injection detector ============
CREATE OR REPLACE FUNCTION public.detect_injection(input text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  patterns text[] := ARRAY[
    '(?i)kinghorsetoto',
    '(?i)judi\s*bola',
    '(?i)fastoto',
    '(?i)intertogel',
    '(?i)royaltoto',
    '(?i)98toto',
    '(?i)slot\s*gacor',
    '(?i)situs\s*togel',
    '(?i)bandar\s*judi',
    '(?i)prediksi\s*togel',
    '(?i)casino\s*online',
    '(?i)sbobet',
    '(?i)pkv\s*games',
    '(?is)<\s*script',
    '(?is)<\s*iframe',
    '(?is)<\s*object',
    '(?is)<\s*embed',
    '(?i)javascript\s*:',
    '(?i)on[a-z]+\s*=\s*["'']',
    '(?i)display\s*:\s*none',
    '(?i)visibility\s*:\s*hidden',
    '(?i)font-size\s*:\s*0',
    '(?i)opacity\s*:\s*0',
    '(?i)position\s*:\s*absolute\s*;\s*left\s*:\s*-'
  ];
  p text;
BEGIN
  IF input IS NULL OR input = '' THEN RETURN NULL; END IF;
  FOREACH p IN ARRAY patterns LOOP
    IF input ~ p THEN RETURN p; END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- ============ Enhanced site_content sanitization + logging ============
CREATE OR REPLACE FUNCTION public.sanitize_site_content()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  text_blob text;
  hit text;
BEGIN
  IF NEW.content IS NOT NULL THEN
    text_blob := NEW.content::text;
    hit := public.detect_injection(text_blob);
    IF hit IS NOT NULL THEN
      INSERT INTO public.injection_block_log(source, reason, matched_pattern, actor, payload_excerpt, metadata)
      VALUES ('site_content', 'blocked_injection', hit, auth.uid(), left(text_blob, 500),
              jsonb_build_object('section', NEW.section_key));
      RAISE EXCEPTION 'site_content blocked: injection pattern % detected', hit;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Enhanced product sanitization already exists; add logging wrapper
CREATE OR REPLACE FUNCTION public.sanitize_product_content()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  hit text;
BEGIN
  IF NEW.name IS NOT NULL THEN
    NEW.name := regexp_replace(NEW.name, '<[^>]*>', '', 'g');
    hit := public.detect_injection(NEW.name);
    IF hit IS NOT NULL THEN
      INSERT INTO public.injection_block_log(source, reason, matched_pattern, actor, payload_excerpt)
      VALUES ('product.name', 'blocked_injection', hit, auth.uid(), left(NEW.name, 500));
      RAISE EXCEPTION 'Product name blocked: pattern % detected', hit;
    END IF;
    NEW.name := btrim(NEW.name);
  END IF;

  IF NEW.description IS NOT NULL THEN
    NEW.description := regexp_replace(NEW.description, '<\s*script[^>]*>.*?<\s*/\s*script\s*>', '', 'gis');
    NEW.description := regexp_replace(NEW.description, '<\s*iframe[^>]*>.*?<\s*/\s*iframe\s*>', '', 'gis');
    NEW.description := regexp_replace(NEW.description, '<\s*style[^>]*>.*?<\s*/\s*style\s*>', '', 'gis');
    NEW.description := regexp_replace(NEW.description, 'on[a-z]+\s*=\s*"[^"]*"', '', 'gi');
    NEW.description := regexp_replace(NEW.description, 'on[a-z]+\s*=\s*''[^'']*''', '', 'gi');
    NEW.description := regexp_replace(NEW.description, 'javascript\s*:', '', 'gi');
    hit := public.detect_injection(NEW.description);
    IF hit IS NOT NULL THEN
      INSERT INTO public.injection_block_log(source, reason, matched_pattern, actor, payload_excerpt)
      VALUES ('product.description', 'blocked_injection', hit, auth.uid(), left(NEW.description, 500));
      RAISE EXCEPTION 'Product description blocked: pattern % detected', hit;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============ Schedule daily security scan ============
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-security-scan');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily-security-scan',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://izeabmhtxtrelfqgkuua.supabase.co/functions/v1/security-scan',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6ZWFibWh0eHRyZWxmcWdrdXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjMzMzksImV4cCI6MjA5MzUzOTMzOX0.ksgeJhbbDI0AsnR9IaP_BjurbGHHODuHAXf4AgUWI0Q"}'::jsonb,
    body := jsonb_build_object('triggered_by','scheduled')
  );
  $$
);
