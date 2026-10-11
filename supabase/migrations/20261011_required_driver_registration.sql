-- Required driver registration vehicle linkage.
-- Additive only: existing profile, vehicle, sales, and commission data remain intact.
alter table public.profiles
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null;

create index if not exists idx_profiles_vehicle_id on public.profiles(vehicle_id);
