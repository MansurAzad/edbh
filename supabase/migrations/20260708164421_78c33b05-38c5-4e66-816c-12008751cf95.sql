
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS subcategory text,
  ADD COLUMN IF NOT EXISTS fabric text,
  ADD COLUMN IF NOT EXISTS work_type text,
  ADD COLUMN IF NOT EXISTS part text,
  ADD COLUMN IF NOT EXISTS hijab_included boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inner_included boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purchase_cost numeric,
  ADD COLUMN IF NOT EXISTS image_alt_text text,
  ADD COLUMN IF NOT EXISTS meta_title text,
  ADD COLUMN IF NOT EXISTS meta_description text;

-- Margin is derived so it can never drift out of sync with the price fields.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS margin numeric
  GENERATED ALWAYS AS (COALESCE(sale_price, price) - COALESCE(purchase_cost, 0)) STORED;

-- SKU should be unique when provided; a partial unique index allows nulls.
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_idx
  ON public.products (sku) WHERE sku IS NOT NULL;

-- Backfill fabric from the legacy `material` column so existing rows keep
-- a value under the new standard field name.
UPDATE public.products SET fabric = material WHERE fabric IS NULL AND material IS NOT NULL;

COMMENT ON COLUMN public.products.purchase_cost IS 'Internal only — never expose to customers.';
COMMENT ON COLUMN public.products.margin IS 'Internal only. Auto-computed: (sale_price ?? price) - (purchase_cost ?? 0).';
