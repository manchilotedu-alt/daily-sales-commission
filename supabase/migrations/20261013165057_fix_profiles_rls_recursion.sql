create or replace function private.current_user_has_branch_scoped_role()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select exists (
    select 1
    from public.profiles caller
    join public.management_roles scoped_role
      on scoped_role.code = caller.role
     and scoped_role.organization_id = caller.organization_id
     and scoped_role.active = true
     and scoped_role.scope_branch_id is not null
    where caller.id = (select auth.uid())
  );
$function$;

revoke all on function private.current_user_has_branch_scoped_role() from public;
grant execute on function private.current_user_has_branch_scoped_role() to authenticated;

drop policy if exists profiles_select_management_scope on public.profiles;

create policy profiles_select_management_scope
on public.profiles
for select
to authenticated
using (
  organization_id = (select public.current_organization_id())
  and (
    (select private.has_management_permission('users.manage'))
    or (select private.has_management_permission('users.create'))
    or (select private.has_management_permission('attendance.manage'))
  )
  and (
    not (select private.current_user_has_branch_scoped_role())
    or branch_id = (select public.current_branch_id())
  )
);