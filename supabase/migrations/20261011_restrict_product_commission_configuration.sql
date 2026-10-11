-- Restrict product and commission configuration to super admins and organization admins.
-- Branch admins may view/assign products, but cannot edit prices or commission rules/types.

drop policy if exists products_insert_super_admin on public.products;
drop policy if exists products_update_super_admin on public.products;
drop policy if exists products_delete_super_admin on public.products;
create policy products_insert_admin_only on public.products for insert to authenticated with check (is_super_admin() or (is_admin() and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())));
create policy products_update_admin_only on public.products for update to authenticated using (is_super_admin() or (is_admin() and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid()))) with check (is_super_admin() or (is_admin() and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())));
create policy products_delete_admin_only on public.products for delete to authenticated using (is_super_admin() or (is_admin() and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())));

drop policy if exists product_variants_insert_super_admin on public.product_variants;
drop policy if exists product_variants_update_super_admin on public.product_variants;
drop policy if exists product_variants_delete_super_admin on public.product_variants;
create policy product_variants_insert_admin_only on public.product_variants for insert to authenticated with check (is_super_admin() or (is_admin() and exists (select 1 from public.products p join public.profiles me on me.id = auth.uid() where p.id = product_variants.product_id and p.organization_id = me.organization_id)));
create policy product_variants_update_admin_only on public.product_variants for update to authenticated using (is_super_admin() or (is_admin() and exists (select 1 from public.products p join public.profiles me on me.id = auth.uid() where p.id = product_variants.product_id and p.organization_id = me.organization_id))) with check (is_super_admin() or (is_admin() and exists (select 1 from public.products p join public.profiles me on me.id = auth.uid() where p.id = product_variants.product_id and p.organization_id = me.organization_id)));
create policy product_variants_delete_admin_only on public.product_variants for delete to authenticated using (is_super_admin() or (is_admin() and exists (select 1 from public.products p join public.profiles me on me.id = auth.uid() where p.id = product_variants.product_id and p.organization_id = me.organization_id)));

drop policy if exists product_price_versions_insert_super_admin on public.product_price_versions;
drop policy if exists product_price_versions_update_super_admin on public.product_price_versions;
drop policy if exists product_price_versions_delete_super_admin on public.product_price_versions;
create policy product_price_versions_insert_admin_only on public.product_price_versions for insert to authenticated with check (is_super_admin() or (is_admin() and exists (select 1 from public.products p join public.profiles me on me.id = auth.uid() where p.id = product_price_versions.product_id and p.organization_id = me.organization_id)));
create policy product_price_versions_update_admin_only on public.product_price_versions for update to authenticated using (is_super_admin() or (is_admin() and exists (select 1 from public.products p join public.profiles me on me.id = auth.uid() where p.id = product_price_versions.product_id and p.organization_id = me.organization_id))) with check (is_super_admin() or (is_admin() and exists (select 1 from public.products p join public.profiles me on me.id = auth.uid() where p.id = product_price_versions.product_id and p.organization_id = me.organization_id)));
create policy product_price_versions_delete_admin_only on public.product_price_versions for delete to authenticated using (is_super_admin() or (is_admin() and exists (select 1 from public.products p join public.profiles me on me.id = auth.uid() where p.id = product_price_versions.product_id and p.organization_id = me.organization_id)));

drop policy if exists commission_rules_insert_authorized on public.commission_rules;
drop policy if exists commission_rules_update_authorized on public.commission_rules;
create policy commission_rules_insert_admin_only on public.commission_rules for insert to authenticated with check (is_super_admin() or (is_admin() and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())));
create policy commission_rules_update_admin_only on public.commission_rules for update to authenticated using (is_super_admin() or (is_admin() and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid()))) with check (is_super_admin() or (is_admin() and organization_id = (select p.organization_id from public.profiles p where p.id = auth.uid())));

drop policy if exists commission_versions_insert_authorized on public.commission_rule_versions;
drop policy if exists commission_rule_versions_insert_authorized on public.commission_rule_versions;
create policy commission_rule_versions_insert_admin_only on public.commission_rule_versions for insert to authenticated with check (is_super_admin() or (is_admin() and exists (select 1 from public.commission_rules r join public.profiles me on me.id = auth.uid() where r.id = commission_rule_versions.commission_rule_id and r.organization_id = me.organization_id)));
drop policy if exists commission_rule_versions_update_admin_only on public.commission_rule_versions;
create policy commission_rule_versions_update_admin_only on public.commission_rule_versions for update to authenticated using (is_super_admin() or (is_admin() and exists (select 1 from public.commission_rules r join public.profiles me on me.id = auth.uid() where r.id = commission_rule_versions.commission_rule_id and r.organization_id = me.organization_id))) with check (is_super_admin() or (is_admin() and exists (select 1 from public.commission_rules r join public.profiles me on me.id = auth.uid() where r.id = commission_rule_versions.commission_rule_id and r.organization_id = me.organization_id)));
