-- Keep employee sales data private to authenticated, policy-scoped users.
-- The old permissive "Anyone views items" policy bypassed the scoped SELECT policy
-- because permissive RLS policies are combined with OR.
DROP POLICY IF EXISTS "Anyone views items" ON public.sale_items;

-- Defense in depth: anonymous REST clients must not access personal or sales records.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.sales FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.sale_items FROM anon;
