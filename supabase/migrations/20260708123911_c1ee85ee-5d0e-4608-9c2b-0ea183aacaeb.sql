
CREATE OR REPLACE FUNCTION public.prevent_duplicate_product_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.products
    WHERE id <> NEW.id
      AND lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(NEW.name), '\s+', ' ', 'g'))
  ) THEN
    RAISE EXCEPTION 'Duplicate product name: "%" already exists. Add color or variant suffix.', NEW.name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_product_name ON public.products;
CREATE TRIGGER trg_prevent_duplicate_product_name
BEFORE INSERT OR UPDATE OF name ON public.products
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_product_name();
