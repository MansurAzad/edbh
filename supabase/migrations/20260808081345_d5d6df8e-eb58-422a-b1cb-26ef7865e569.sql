
CREATE OR REPLACE FUNCTION public.detect_injection(input text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  patterns text[] := ARRAY[
    '(?i)kinghorsetoto',
    '(?i)judi\s*bola',
    '(?i)bandar\s*bola',
    '(?i)kingdom\s*4d',
    '(?i)toto\s*amanah',
    '(?i)fastoto',
    '(?i)intertogel',
    '(?i)royaltoto',
    '(?i)98toto',
    '(?i)slot\s*gacor',
    '(?i)situs\s*togel',
    '(?i)bandar\s*judi',
    '(?i)prediksi\s*togel',
    '(?i)casino\s*online',
    '(?i)sbobet',
    '(?i)pkv\s*games',
    '(?is)<\s*script',
    '(?is)<\s*iframe',
    '(?is)<\s*object',
    '(?is)<\s*embed',
    '(?i)javascript\s*:',
    '(?i)on[a-z]+\s*=\s*["'']',
    '(?i)display\s*:\s*none',
    '(?i)visibility\s*:\s*hidden',
    '(?i)font-size\s*:\s*0',
    '(?i)opacity\s*:\s*0',
    '(?i)position\s*:\s*absolute\s*;\s*left\s*:\s*-'
  ];
  p text;
BEGIN
  IF input IS NULL OR input = '' THEN RETURN NULL; END IF;
  FOREACH p IN ARRAY patterns LOOP
    IF input ~ p THEN RETURN p; END IF;
  END LOOP;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sanitize_blog_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  spam_pattern TEXT := '(?i)(kinghorsetoto|judi\s*bola|bandar\s*bola|kingdom\s*4d|toto\s*amanah|fastoto|intertogel|slot\s*gacor|situs\s*togel|bandar\s*judi|prediksi\s*togel|casino\s*online|sbobet|pkv\s*games)';
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
$function$;
