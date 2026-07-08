
-- 1) Audit log table for bulk product edits
CREATE TABLE IF NOT EXISTS public.product_edit_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email TEXT,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  source TEXT NOT NULL DEFAULT 'bulk_edit',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.product_edit_audit TO authenticated;
GRANT ALL ON public.product_edit_audit TO service_role;

ALTER TABLE public.product_edit_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view audit" ON public.product_edit_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert audit" ON public.product_edit_audit
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND admin_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_product_edit_audit_product ON public.product_edit_audit(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_edit_audit_admin ON public.product_edit_audit(admin_id, created_at DESC);

-- 2) Server-side sanitization trigger on products (defense in depth vs spam injection)
CREATE OR REPLACE FUNCTION public.sanitize_product_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  spam_pattern TEXT := '(?i)(kinghorsetoto|judi\s*bola|fastoto|intertogel|slot\s*gacor|situs\s*togel|bandar\s*judi|prediksi\s*togel|casino\s*online|sbobet|pkv\s*games|<\s*script|<\s*iframe|display\s*:\s*none|visibility\s*:\s*hidden|position\s*:\s*absolute\s*;\s*left\s*:\s*-)';
BEGIN
  IF NEW.name IS NOT NULL THEN
    -- Strip any HTML tags from name entirely
    NEW.name := regexp_replace(NEW.name, '<[^>]*>', '', 'g');
    IF NEW.name ~ spam_pattern THEN
      RAISE EXCEPTION 'Product name contains blocked content (spam/injection pattern detected)';
    END IF;
    NEW.name := btrim(NEW.name);
  END IF;

  IF NEW.description IS NOT NULL THEN
    -- Remove dangerous tags/attributes but keep normal text/markdown
    NEW.description := regexp_replace(NEW.description, '<\s*script[^>]*>.*?<\s*/\s*script\s*>', '', 'gis');
    NEW.description := regexp_replace(NEW.description, '<\s*iframe[^>]*>.*?<\s*/\s*iframe\s*>', '', 'gis');
    NEW.description := regexp_replace(NEW.description, '<\s*style[^>]*>.*?<\s*/\s*style\s*>', '', 'gis');
    NEW.description := regexp_replace(NEW.description, 'on[a-z]+\s*=\s*"[^"]*"', '', 'gi');
    NEW.description := regexp_replace(NEW.description, 'on[a-z]+\s*=\s*''[^'']*''', '', 'gi');
    NEW.description := regexp_replace(NEW.description, 'javascript\s*:', '', 'gi');
    IF NEW.description ~ spam_pattern THEN
      RAISE EXCEPTION 'Product description contains blocked content (spam/injection pattern detected)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_product_content ON public.products;
CREATE TRIGGER trg_sanitize_product_content
  BEFORE INSERT OR UPDATE OF name, description ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_product_content();
