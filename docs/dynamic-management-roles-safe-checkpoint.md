# Dynamic Management Roles — Safe Implementation Checkpoint

## Scope

This work is isolated to the `feat/dynamic-management-roles-safe` branch. It must not alter sales, commission calculation/payout, team split, workforce, or attendance behavior.

## Required behavior

- Super Admin and Admin are the global management tier.
- Global administrators can create and maintain management roles and switch page/action permissions on or off.
- Branch Admin can create/manage ordinary users only inside their own organization and branch, subject to explicitly granted permissions.
- Branch Admin cannot create, edit, or assign management roles.
- User provisioning uses phone number and password; do not introduce email-based login.
- Existing commission/payment history and audit/correction rules remain intact.

## Verified compatibility blocker

The live Supabase project inspected for this task has:

- `public.profiles` with a role check constraint permitting the existing fixed roles: `super_admin`, `admin`, `branch_admin`, `lead`, `lead_sales`, `assistant`, and `driver`.
- `public.permissions` with columns `id, code, name_am, module, active, created_at`.
- `public.branch_admin_permissions` for branch-admin permission toggles.
- No `public.roles` or `public.role_permissions` tables in the inspected live public schema.

The repository migration `20261007_dirsha_safe_upgrade.sql` describes a different shape for `public.permissions` (`name`, `description`) and creates `roles` / `role_permissions`. Repository migrations and the live database therefore cannot be assumed to be in sync.

## Safe next steps

1. Reconcile the intended RBAC schema with the live schema and identify the exact existing role constraint and RLS policies through an approved read-only schema review.
2. Prepare a forward-only, idempotent migration that preserves the current permissions rows and branch-admin grants; do not run it automatically.
3. Add server-side role/permission checks before exposing dynamic role assignment in the UI. A UI-only permission toggle is not an authorization boundary.
4. Update login/profile acceptance and navigation only after the stored role representation is agreed and server enforcement is in place.
5. Validate branch isolation and role escalation cases, then run the frontend build and focused tests.
6. Obtain explicit approval before applying database changes, merging, or deploying.

## Explicit exclusions

- Do not edit `supabase/migrations/20261012_persistent_variable_sales_teams.sql`.
- Do not alter sales, commission, payout, team split, workforce, or attendance logic as part of this RBAC change.
- Do not apply migrations, change production data, merge, or deploy as part of this checkpoint.
