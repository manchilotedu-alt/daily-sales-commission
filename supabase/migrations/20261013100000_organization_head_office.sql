-- Every organization has a permanent Head Office location.
-- Head Office is represented in branches for compatibility with existing branch-scoped data,
-- but it is marked separately and does not consume the organization's regular branch limit.

alter table public.branches
  add column if not exists is_head_office boolean not null default false;

create unique index if not exists branches_one_head_office_per_organization
  on public.branches (organization_id)
  where is_head_office = true;

insert into public.branches (organization_id, name, code, active, is_head_office)
select o.id, 'ዋና መስሪያ ቤት', 'HEAD-OFFICE', true, true
from public.organizations o
where not exists (
  select 1 from public.branches b
  where b.organization_id = o.id and b.is_head_office = true
);

-- Preserve legacy users that had no branch assignment by placing them at Head Office.
-- Branch Admins are excluded because that role must remain attached to a regular branch.
update public.profiles p
set branch_id = b.id
from public.branches b
where p.organization_id = b.organization_id
  and b.is_head_office = true
  and p.branch_id is null
  and p.role <> 'branch_admin';

create or replace function public.create_head_office_for_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.branches (organization_id, name, code, active, is_head_office)
  values (new.id, 'ዋና መስሪያ ቤት', 'HEAD-OFFICE', true, true)
  on conflict (organization_id) where is_head_office = true do nothing;
  return new;
end;
$$;

revoke all on function public.create_head_office_for_organization() from public, anon, authenticated;

drop trigger if exists organizations_create_head_office on public.organizations;
create trigger organizations_create_head_office
after insert on public.organizations
for each row execute function public.create_head_office_for_organization();
