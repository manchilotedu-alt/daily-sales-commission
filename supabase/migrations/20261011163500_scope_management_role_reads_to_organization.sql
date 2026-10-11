-- Restrict role and role-permission reads to the caller's organization/assigned role.
drop policy if exists management_roles_read_active on public.management_roles;
create policy management_roles_read_active
on public.management_roles
for select
to authenticated
using (
  is_super_admin()
  or (
    active = true
    and organization_id = (select current_organization_id())
  )
);

drop policy if exists management_role_permissions_read on public.management_role_permissions;
create policy management_role_permissions_read
on public.management_role_permissions
for select
to authenticated
using (
  is_super_admin()
  or exists (
    select 1
    from public.profiles p
    join public.management_roles r
      on r.code = p.role
     and r.organization_id = p.organization_id
     and r.active = true
    where p.id = (select auth.uid())
      and p.active = true
      and p.organization_id = (select current_organization_id())
      and r.id = management_role_permissions.role_id
  )
);
