
CREATE OR REPLACE FUNCTION public.sanitize_html_content(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out TEXT := input;
BEGIN
  IF out IS NULL THEN RETURN NULL; END IF;
  out := regexp_replace(out, '<\s*script[^>]*>.*?<\s*/\s*script\s*>', '', 'gis');
  out := regexp_replace(out, '<\s*iframe[^>]*>.*?<\s*/\s*iframe\s*>', '', 'gis');
  out := regexp_replace(out, '<\s*style[^>]*>.*?<\s*/\s*style\s*>', '', 'gis');
  out := regexp_replace(out, '<\s*noscript[^>]*>.*?<\s*/\s*noscript\s*>', '', 'gis');
  out := regexp_replace(out, 'on[a-z]+\s*=\s*"[^"]*"', '', 'gi');
  out := regexp_replace(out, 'on[a-z]+\s*=\s*''[^'']*''', '', 'gi');
  out := regexp_replace(out, 'javascript\s*:', '', 'gi');
  out := regexp_replace(out, 'style\s*=\s*"[^"]*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0)[^"]*"', '', 'gi');
  out := regexp_replace(out, 'style\s*=\s*''[^'']*(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0|opacity\s*:\s*0)[^'']*''', '', 'gi');
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.sanitize_blog_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  spam_pattern TEXT := '(?i)(kinghorsetoto|judi\s*bola|fastoto|intertogel|slot\s*gacor|situs\s*togel|bandar\s*judi|prediksi\s*togel|casino\s*online|sbobet|pkv\s*games)';
BEGIN
  IF NEW.title IS NOT NULL THEN
    NEW.title := regexp_replace(NEW.title, '<[^>]*>', '', 'g');
    IF NEW.title ~ spam_pattern THEN
      RAISE EXCEPTION 'Blog title contains blocked content';
    END IF;
  END IF;
  IF NEW.content IS NOT NULL THEN
    NEW.content := public.sanitize_html_content(NEW.content);
    IF NEW.content ~ spam_pattern THEN
      RAISE EXCEPTION 'Blog content contains blocked spam content';
    END IF;
  END IF;
  IF NEW.excerpt IS NOT NULL THEN
    NEW.excerpt := public.sanitize_html_content(NEW.excerpt);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_blog_post ON public.blog_posts;
CREATE TRIGGER trg_sanitize_blog_post
  BEFORE INSERT OR UPDATE OF title, content, excerpt ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_blog_post();

CREATE OR REPLACE FUNCTION public.sanitize_site_content()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  spam_pattern TEXT := '(?i)(kinghorsetoto|judi\s*bola|fastoto|intertogel|slot\s*gacor|situs\s*togel|bandar\s*judi|prediksi\s*togel|casino\s*online|sbobet|pkv\s*games)';
BEGIN
  IF NEW.content IS NOT NULL THEN
    IF NEW.content::text ~ spam_pattern THEN
      RAISE EXCEPTION 'site_content contains blocked spam content';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sanitize_site_content ON public.site_content;
CREATE TRIGGER trg_sanitize_site_content
  BEFORE INSERT OR UPDATE OF content ON public.site_content
  FOR EACH ROW EXECUTE FUNCTION public.sanitize_site_content();

UPDATE public.blog_posts
SET content = public.sanitize_html_content(content),
    excerpt = public.sanitize_html_content(excerpt)
WHERE content ~* '<\s*(script|iframe|style|noscript)\b'
   OR content ~* 'display\s*:\s*none'
   OR content ~* 'visibility\s*:\s*hidden'
   OR content ~* 'font-size\s*:\s*0'
   OR content ~* 'opacity\s*:\s*0';
