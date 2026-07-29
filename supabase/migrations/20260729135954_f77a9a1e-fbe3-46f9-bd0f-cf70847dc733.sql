CREATE TABLE IF NOT EXISTS public.indexing_fix_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'unresolved',
  action_title text,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT indexing_fix_status_status_check CHECK (status IN ('unresolved','in_progress','applied'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.indexing_fix_status TO authenticated;
GRANT ALL ON public.indexing_fix_status TO service_role;

ALTER TABLE public.indexing_fix_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fix status" ON public.indexing_fix_status
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert fix status" ON public.indexing_fix_status
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update fix status" ON public.indexing_fix_status
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete fix status" ON public.indexing_fix_status
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_indexing_fix_status_updated_at
  BEFORE UPDATE ON public.indexing_fix_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();