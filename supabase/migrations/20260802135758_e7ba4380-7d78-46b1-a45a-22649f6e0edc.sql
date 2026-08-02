ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_tags_max_10;
ALTER TABLE public.products ADD CONSTRAINT products_tags_max_10 CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 10);
CREATE INDEX IF NOT EXISTS products_tags_gin ON public.products USING gin (tags);