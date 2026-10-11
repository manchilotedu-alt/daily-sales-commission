-- Tighten direct RPC execution of SECURITY DEFINER helpers.
-- Keep authenticated execution only for helpers used by RLS; trigger functions are not client RPCs.
revoke execute on function public.current_branch_id() from public, anon;
revoke execute on function public.current_organization_id() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_branch_admin() from public, anon;
revoke execute on function public.is_super_admin() from public, anon;

revoke execute on function public.enforce_branch_limit() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.validate_branch_limit() from public, anon, authenticated;

-- Explicit deny policies document that client access is intentionally blocked.
drop policy if exists earnings_adjustments_client_deny on public.earnings_adjustments;
create policy earnings_adjustments_client_deny
  on public.earnings_adjustments for all to authenticated
  using (false) with check (false);

drop policy if exists earnings_holds_client_deny on public.earnings_holds;
create policy earnings_holds_client_deny
  on public.earnings_holds for all to authenticated
  using (false) with check (false);
