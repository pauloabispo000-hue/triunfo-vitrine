-- Narrow cleanup for this explicitly authorized fictitious validation workflow.
-- No table recreation, role changes or access to arbitrary user IDs.
begin;
create function public.triunfo_cleanup_validation(p_run uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_users uuid[]; v_products uuid[]; v_orders uuid[]; v_paths jsonb;
begin
 select coalesce(array_agg(u.id),'{}'::uuid[]) into v_users from auth.users u
 where u.raw_user_meta_data->>'triunfo_validation_run'=p_run::text
 and u.email in ('triunfo-test-'||p_run::text||'-a@example.invalid',
                 'triunfo-test-'||p_run::text||'-b@example.invalid')
 and not exists(select 1 from triunfo_private.admins a where a.user_id=u.id);
 select coalesce(array_agg(id),'{}'::uuid[]) into v_products from public.triunfo_products
 where name='TESTE VALIDACAO '||p_run::text;
 select coalesce(array_agg(id),'{}'::uuid[]) into v_orders from public.triunfo_orders where user_id=any(v_users);
 if exists(select 1 from public.triunfo_order_items where product_id=any(v_products)
   and not(order_id=any(v_orders))) then raise exception 'Produto de teste possui pedido fora da execução'; end if;
 select coalesce(jsonb_agg(object_path),'[]'::jsonb) into v_paths from public.triunfo_receipts where user_id=any(v_users);
 delete from public.triunfo_receipts where user_id=any(v_users);
 delete from public.triunfo_order_items where order_id=any(v_orders);
 delete from public.triunfo_orders where id=any(v_orders);
 delete from public.triunfo_cart_items where user_id=any(v_users) or product_id=any(v_products);
 delete from public.triunfo_votes where user_id=any(v_users) or product_id=any(v_products);
 delete from public.triunfo_suggestions where user_id=any(v_users);
 delete from public.triunfo_products where id=any(v_products);
 delete from public.triunfo_audit_events where actor_id=any(v_users)
  or target_id in (select unnest(v_products)::text union all select unnest(v_orders)::text);
 return jsonb_build_object('users',to_jsonb(v_users),'paths',v_paths,'orders_removed',cardinality(v_orders),'products_removed',cardinality(v_products));
end; $$;
revoke all on function public.triunfo_cleanup_validation(uuid) from public,anon,authenticated;
grant execute on function public.triunfo_cleanup_validation(uuid) to service_role;
commit;
