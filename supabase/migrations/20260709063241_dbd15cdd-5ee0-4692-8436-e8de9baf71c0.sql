
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Similarity scanner for product descriptions (admin-only, security definer)
CREATE OR REPLACE FUNCTION public.find_duplicate_product_descriptions(_threshold real DEFAULT 0.7)
RETURNS TABLE(
  product_a uuid, name_a text, slug_a text,
  product_b uuid, name_b text, slug_b text,
  similarity real,
  exact_match boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p1.id, p1.name, p1.slug,
         p2.id, p2.name, p2.slug,
         similarity(p1.description, p2.description) AS sim,
         (p1.description = p2.description) AS exact_match
  FROM public.products p1
  JOIN public.products p2
    ON p1.id < p2.id
   AND p1.description IS NOT NULL
   AND p2.description IS NOT NULL
   AND length(p1.description) > 40
   AND length(p2.description) > 40
   AND similarity(p1.description, p2.description) >= _threshold
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY sim DESC
  LIMIT 500;
$$;

-- Restore a product's description from description_backup (admin-only)
CREATE OR REPLACE FUNCTION public.restore_product_description(_product_id uuid)
RETURNS TABLE(product_id uuid, restored boolean, restored_text text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_backup text;
  v_current text;
  v_admin_email text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin role required';
  END IF;

  SELECT description_backup, description INTO v_backup, v_current
  FROM public.products WHERE id = _product_id;

  IF v_backup IS NULL OR btrim(v_backup) = '' THEN
    RETURN QUERY SELECT _product_id, false, NULL::text;
    RETURN;
  END IF;

  UPDATE public.products SET description = v_backup, updated_at = now()
  WHERE id = _product_id;

  SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.product_edit_audit(product_id, admin_id, admin_email, field, old_value, new_value, source)
  VALUES (_product_id, auth.uid(), v_admin_email, 'description', COALESCE(v_current,''), v_backup, 'restore_backup');

  RETURN QUERY SELECT _product_id, true, v_backup;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_product_descriptions(real) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_product_description(uuid) TO authenticated;
