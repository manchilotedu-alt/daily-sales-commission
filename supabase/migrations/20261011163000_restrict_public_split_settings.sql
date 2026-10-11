-- Commission split configuration is not public information.
-- Preserve authenticated application reads while preventing anonymous access.
DROP POLICY IF EXISTS "Anyone views split" ON public.split_settings;
REVOKE ALL PRIVILEGES ON TABLE public.split_settings FROM anon;
