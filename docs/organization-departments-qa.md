# Organization and department rollout QA checklist

Status: staging checklist only. Do not deploy to production until all blocking checks pass.

## Preconditions
- [ ] Use a non-production Supabase project with a recent, sanitized schema snapshot.
- [ ] Generate an official Supabase CLI migration from the draft SQL and review it.
- [ ] Verify the existing `profiles` policies, `is_super_admin()` implementation, and Admin role model before applying RLS policies.
- [ ] Deploy the updated `manage-user` Edge Function to staging only after adding server-side department validation.
- [ ] Confirm the Vercel preview build is Ready and inspect its build logs.

## Department management
- [ ] Super Admin can list, create, rename, activate, and deactivate departments.
- [ ] Admin can perform only the intended organization-scoped actions.
- [ ] A user without management privileges cannot list or mutate departments.
- [ ] Duplicate department names and codes within the same organization are rejected.
- [ ] The same department name/code can be used in a different organization.
- [ ] Inactive departments cannot be newly assigned to employees.
- [ ] Failed requests display a clear error and do not show a success message.

## Employee assignment
- [ ] Existing employee records continue to load when `department_id` is null.
- [ ] Create and update validate that the selected department is active and belongs to the selected organization.
- [ ] Attempts to assign another organization's department are rejected server-side.
- [ ] Changing an employee's organization cannot leave a mismatched department assignment.
- [ ] Employee edit forms retain the existing department and can clear it.
- [ ] Branch assignment remains required under the current model unless a separate approved design changes that rule.

## Regression checks
- [ ] Organization and branch lists, employee create/edit, activation, and password reset still work.
- [ ] Branch Admin cannot manage another branch's employees.
- [ ] Sales entry, attendance, team assignments, commission rules, approvals, and earnings are unchanged.
- [ ] RLS denies unauthorized reads/writes using direct API calls, not just hidden UI controls.
- [ ] Run `npm run build` and any available automated tests.
- [ ] Test on mobile layout and verify success/error feedback.

## Release gate
- [ ] All checks above pass in staging.
- [ ] Review the complete PR diff and migration.
- [ ] Obtain approval before merging to the protected base branch.
- [ ] Apply the approved migration through the normal migration process.
- [ ] Deploy production only after the migration and application release are coordinated and rollback steps are ready.

Current blockers: employee UI integration and server-side department validation are not complete; the migration is a draft and has not been applied; Vercel preview status is not verified due an access-scope 403.
