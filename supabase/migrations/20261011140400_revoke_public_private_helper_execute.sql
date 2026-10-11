REVOKE ALL ON FUNCTION private.current_branch_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.current_organization_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_branch_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_super_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.current_branch_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.current_organization_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_branch_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_super_admin() TO authenticated, service_role;
