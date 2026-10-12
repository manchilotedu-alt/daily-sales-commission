-- Roll back the unused settings table introduced by the mistaken Page 7 interpretation.
-- The table was verified empty before removal.
drop table if exists public.organization_settings;
