-- Keep the existing helper implementations and policy dependencies, but move the
-- SECURITY DEFINER implementations out of the exposed public API schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

do $migration$
declare
  fn text;
  definition text;
begin
  foreach fn in array array[
    'current_branch_id',
    'current_organization_id',
    'is_admin',
    'is_branch_admin',
    'is_super_admin'
  ]
  loop
    select pg_get_functiondef(p.oid)
      into definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = fn
      and pg_get_function_identity_arguments(p.oid) = '';

    if definition is null then
      raise exception 'Expected helper public.%() was not found', fn;
    end if;

    definition := replace(definition, 'FUNCTION public.' || fn || '()', 'FUNCTION private.' || fn || '()');
    execute definition;
  end loop;
end
$migration$;

-- Public wrappers remain callable by RLS policies, but no longer run with
-- SECURITY DEFINER privileges. Their private callees retain the original,
-- already-used implementations and privilege boundary.
create or replace function public.current_branch_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog, private
as $$ select private.current_branch_id() $$;

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog, private
as $$ select private.current_organization_id() $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, private
as $$ select private.is_admin() $$;

create or replace function public.is_branch_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, private
as $$ select private.is_branch_admin() $$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, private
as $$ select private.is_super_admin() $$;

grant execute on function private.current_branch_id() to authenticated, service_role;
grant execute on function private.current_organization_id() to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;
grant execute on function private.is_branch_admin() to authenticated, service_role;
grant execute on function private.is_super_admin() to authenticated, service_role;

revoke execute on function public.current_branch_id() from public, anon;
revoke execute on function public.current_organization_id() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_branch_admin() from public, anon;
revoke execute on function public.is_super_admin() from public, anon;
