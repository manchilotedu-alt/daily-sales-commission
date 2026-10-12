create table if not exists public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint organization_settings_object check (jsonb_typeof(settings) = 'object')
);

alter table public.organization_settings enable row level security;

drop policy if exists organization_settings_admin_read on public.organization_settings;
create policy organization_settings_admin_read
on public.organization_settings
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.active = true and p.role in ('super_admin', 'admin')
));

drop policy if exists organization_settings_admin_insert on public.organization_settings;
create policy organization_settings_admin_insert
on public.organization_settings
for insert to authenticated
with check (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.active = true and p.role in ('super_admin', 'admin')
));

drop policy if exists organization_settings_admin_update on public.organization_settings;
create policy organization_settings_admin_update
on public.organization_settings
for update to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.active = true and p.role in ('super_admin', 'admin')
))
with check (exists (
  select 1 from public.profiles p
  where p.id = auth.uid() and p.active = true and p.role in ('super_admin', 'admin')
));

grant select, insert, update on public.organization_settings to authenticated;
