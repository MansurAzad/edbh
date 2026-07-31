CREATE TABLE public.indexing_fix_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  status text NOT NULL,
  action_title text,
  notes text,
  changed_by uuid,
  changed_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.indexing_fix_history TO authenticated;
GRANT ALL ON public.indexing_fix_history TO service_role;

ALTER TABLE public.indexing_fix_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fix history"
ON public.indexing_fix_history FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert fix history"
ON public.indexing_fix_history FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_indexing_fix_history_url_created ON public.indexing_fix_history (url, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_indexing_fix_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.action_title IS NOT DISTINCT FROM OLD.action_title
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.indexing_fix_history(url, status, action_title, notes, changed_by, changed_by_email)
  VALUES (NEW.url, NEW.status, NEW.action_title, NEW.notes, auth.uid(), v_email);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_indexing_fix_change
AFTER INSERT OR UPDATE ON public.indexing_fix_status
FOR EACH ROW EXECUTE FUNCTION public.log_indexing_fix_change();