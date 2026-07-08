
ALTER TABLE public.security_scan_reports
  ADD COLUMN IF NOT EXISTS cancel_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_message text;

-- Enrich schedule with timezone/weekdays/start_time_of_day (kept in the jsonb)
UPDATE public.security_scan_settings
SET schedule = COALESCE(schedule, '{}'::jsonb)
  || jsonb_build_object(
    'timezone', COALESCE(schedule->>'timezone', 'UTC'),
    'weekdays', COALESCE(schedule->'weekdays', '[1,2,3,4,5,6,0]'::jsonb),
    'start_time_of_day', COALESCE(schedule->>'start_time_of_day', '03:00')
  );

-- Realtime
ALTER TABLE public.security_scan_reports REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'security_scan_reports'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.security_scan_reports';
  END IF;
END $$;
