ALTER TABLE public.seo_canonical_overrides ADD COLUMN IF NOT EXISTS batch_id uuid;

CREATE TABLE IF NOT EXISTS public.seo_canonical_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  path text NOT NULL,
  previous_canonical_path text,
  new_canonical_path text,
  operation text NOT NULL DEFAULT 'apply',
  rolled_back boolean NOT NULL DEFAULT false,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seo_canonical_history_batch_idx ON public.seo_canonical_history (batch_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_canonical_history TO authenticated;
GRANT ALL ON public.seo_canonical_history TO service_role;
ALTER TABLE public.seo_canonical_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage canonical history" ON public.seo_canonical_history FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.seo_meta_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_key text NOT NULL UNIQUE,
  path text NOT NULL,
  snapshot jsonb NOT NULL,
  published_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_meta_snapshots TO authenticated;
GRANT ALL ON public.seo_meta_snapshots TO service_role;
ALTER TABLE public.seo_meta_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage meta snapshots" ON public.seo_meta_snapshots FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER seo_meta_snapshots_updated_at BEFORE UPDATE ON public.seo_meta_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();