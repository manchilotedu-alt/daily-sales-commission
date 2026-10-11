-- Automatically create standard management-role templates for each new organization.
-- The trigger is idempotent and only inserts missing role/permission rows.

create or replace function public.seed_organization_role_templates()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  role_template record;
  role_row public.management_roles%rowtype;
  role_code text;
  org_suffix text := replace(left(new.id::text, 8), '-', '');
begin
  for role_template in
    select * from (values
      ('hr', 'ሰው ሀብት (HR)', array['users.create','users.manage','attendance.manage','performance.view','reports.export']::text[]),
      ('finance', 'ፋይናንስ', array['commission.view','earnings.view','periods.manage','disputes.manage','reports.export']::text[]),
      ('commission_manager', 'የኮሚሽን አስተዳዳሪ', array['commission.view','commission.set','sales.review','earnings.view','periods.manage','disputes.manage','reports.export']::text[]),
      ('sales_manager', 'የሽያጭ አስተዳዳሪ', array['sales.create','sales.review','products.view','products.assign','teams.manage','teams.split','performance.view','reports.export']::text[]),
      ('auditor', 'የውስጥ ኦዲት', array['audit.view','commission.view','earnings.view','performance.view','reports.export']::text[])
    ) as templates(slug, name_am, permission_codes)
  loop
    role_code := 'custom_' || role_template.slug || '_' || org_suffix;
    insert into public.management_roles(code, name_am, organization_id, active)
    values (role_code, role_template.name_am, new.id, true)
    on conflict (code) do nothing;

    select * into role_row from public.management_roles
    where code = role_code and organization_id = new.id limit 1;

    if role_row.id is not null then
      insert into public.management_role_permissions(role_id, permission_code, enabled)
      select role_row.id, p.code, p.code = any(role_template.permission_codes)
      from public.permissions p where p.active = true
      on conflict (role_id, permission_code) do nothing;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists organizations_seed_role_templates on public.organizations;
create trigger organizations_seed_role_templates
after insert on public.organizations
for each row execute function public.seed_organization_role_templates();

revoke all on function public.seed_organization_role_templates() from public, anon, authenticated;

-- Backfill organizations that do not yet have all five templates.
do $$
declare
  org record;
  role_template record;
  role_row public.management_roles%rowtype;
  role_code text;
  org_suffix text;
begin
  for org in select id from public.organizations loop
    org_suffix := replace(left(org.id::text, 8), '-', '');
    for role_template in
      select * from (values
        ('hr', 'ሰው ሀብት (HR)', array['users.create','users.manage','attendance.manage','performance.view','reports.export']::text[]),
        ('finance', 'ፋይናንስ', array['commission.view','earnings.view','periods.manage','disputes.manage','reports.export']::text[]),
        ('commission_manager', 'የኮሚሽን አስተዳዳሪ', array['commission.view','commission.set','sales.review','earnings.view','periods.manage','disputes.manage','reports.export']::text[]),
        ('sales_manager', 'የሽያጭ አስተዳዳሪ', array['sales.create','sales.review','products.view','products.assign','teams.manage','teams.split','performance.view','reports.export']::text[]),
        ('auditor', 'የውስጥ ኦዲት', array['audit.view','commission.view','earnings.view','performance.view','reports.export']::text[])
      ) as templates(slug, name_am, permission_codes)
    loop
      role_code := 'custom_' || role_template.slug || '_' || org_suffix;
      insert into public.management_roles(code, name_am, organization_id, active)
      values (role_code, role_template.name_am, org.id, true)
      on conflict (code) do nothing;

      select * into role_row from public.management_roles
      where code = role_code and organization_id = org.id limit 1;

      if role_row.id is not null then
        insert into public.management_role_permissions(role_id, permission_code, enabled)
        select role_row.id, p.code, p.code = any(role_template.permission_codes)
        from public.permissions p where p.active = true
        on conflict (role_id, permission_code) do nothing;
      end if;
    end loop;
  end loop;
end;
$$;
