CREATE TABLE IF NOT EXISTS public.seo_canonical_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL UNIQUE,
  canonical_path text NOT NULL,
  target_keyword text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.seo_canonical_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_canonical_overrides TO authenticated;
GRANT ALL ON public.seo_canonical_overrides TO service_role;
ALTER TABLE public.seo_canonical_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read canonical overrides" ON public.seo_canonical_overrides FOR SELECT USING (true);
CREATE POLICY "Admins manage canonical overrides" ON public.seo_canonical_overrides FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER seo_canonical_overrides_updated_at BEFORE UPDATE ON public.seo_canonical_overrides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.indexing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  request_type text NOT NULL DEFAULT 'URL_UPDATED',
  status text NOT NULL DEFAULT 'pending',
  http_status integer,
  response jsonb,
  error text,
  requested_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS indexing_requests_url_idx ON public.indexing_requests (url, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.indexing_requests TO authenticated;
GRANT ALL ON public.indexing_requests TO service_role;
ALTER TABLE public.indexing_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read indexing requests" ON public.indexing_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write indexing requests" ON public.indexing_requests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));