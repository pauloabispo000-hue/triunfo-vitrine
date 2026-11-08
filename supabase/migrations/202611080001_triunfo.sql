-- Additive Supabase schema. Does not import or modify legacy public.users.
-- Apply exactly once through migrations, after inspecting the target database.
begin;
create schema if not exists triunfo_private;
revoke all on schema triunfo_private from public, anon, authenticated;
grant usage on schema triunfo_private to authenticated;

create table public.triunfo_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 90),
 photo text check(photo is null or length(photo) <= 500000),
 created_at timestamptz not null default now()
);
create table triunfo_private.admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create function triunfo_private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from triunfo_private.admins where user_id = auth.uid()); $$;

create table public.triunfo_products (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 120),
 price_cents integer not null default 0 check(price_cents between 0 and 100000000),
 status text not null default 'voting' check(status in ('available','voting','viability','production','archived')),
 stock integer not null default 0 check(stock between 0 and 1000000),
 image text check(image is null or length(image) <= 3000000),
 emoji text not null default '🍰' check(length(emoji) <= 20),
 created_at timestamptz not null default now(),
 check(status <> 'available' or price_cents > 0)
);
create table public.triunfo_votes (
 user_id uuid not null references auth.users(id),
 product_id uuid not null references public.triunfo_products(id),
 favorable boolean not null,
 created_at timestamptz not null default now(),
 primary key(user_id,product_id)
);
create index triunfo_votes_product_idx on public.triunfo_votes(product_id);
create table public.triunfo_suggestions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(length(trim(name)) between 1 and 120),
 image text check(image is null or length(image) <= 3000000),
 status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 created_at timestamptz not null default now()
);
create index triunfo_suggestions_user_idx on public.triunfo_suggestions(user_id);
create table public.triunfo_cart_items (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 product_id uuid not null references public.triunfo_products(id),
 qty integer not null check(qty between 1 and 99),
 primary key(user_id,product_id)
);
create index triunfo_cart_product_idx on public.triunfo_cart_items(product_id);
create table public.triunfo_orders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 request_id uuid not null,
 total_cents integer not null check(total_cents between 1 and 100000000),
 recognized_cents integer not null default 0 check(recognized_cents >= 0),
 status text not null default 'awaiting_receipt' check(status in
 ('awaiting_receipt','under_review','amount_pending','amount_matches','manual_review','confirmed','cancelled')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,request_id)
);
create index triunfo_orders_user_idx on public.triunfo_orders(user_id,created_at desc);
create table public.triunfo_order_items (
 order_id uuid not null references public.triunfo_orders(id),
 product_id uuid not null references public.triunfo_products(id),
 name text not null,
 qty integer not null check(qty between 1 and 99),
 unit_price_cents integer not null check(unit_price_cents > 0),
 primary key(order_id,product_id)
);
create index triunfo_order_items_product_idx on public.triunfo_order_items(product_id);
create table public.triunfo_receipts (
 id uuid primary key,
 order_id uuid not null references public.triunfo_orders(id),
 user_id uuid not null references auth.users(id),
 object_path text not null unique,
 sha256 text not null unique check(sha256 ~ '^[0-9a-f]{64}$'),
 original_name text not null check(length(original_name) between 1 and 200),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 recognized_cents integer check(recognized_cents between 1 and 100000000),
 transaction_id text unique check(transaction_id is null or transaction_id ~ '^[A-Z0-9]{20,64}$'),
 ocr_text text check(ocr_text is null or length(ocr_text) <= 10000),
 status text not null default 'pending_review' check(status in ('pending_review','read','unreadable','rejected')),
 created_at timestamptz not null default now(),
 check(object_path = user_id::text || '/' || id::text)
);
create index triunfo_receipts_order_idx on public.triunfo_receipts(order_id);
create index triunfo_receipts_user_idx on public.triunfo_receipts(user_id);
create table public.triunfo_settings (
 singleton boolean primary key default true check(singleton),
 store text not null default 'Triunfo Sobremesas' check(length(store) between 1 and 120),
 pix text not null default '' check(length(pix) <= 140)
);
insert into public.triunfo_settings(singleton) values(true);
create table public.triunfo_audit_events (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid references auth.users(id),
 action text not null,
 target_id text,
 created_at timestamptz not null default now()
);
create index triunfo_audit_actor_idx on public.triunfo_audit_events(actor_id,created_at desc);

-- Clients cannot promote themselves: membership is held outside the API schema.
create function public.triunfo_is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select triunfo_private.is_admin(); $$;
create function triunfo_private.profile_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.triunfo_profiles(id,display_name)
 values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Cliente'),90));
 return new;
end; $$;
create trigger triunfo_auth_profile after insert on auth.users
for each row execute function triunfo_private.profile_created();
insert into public.triunfo_profiles(id,display_name)
 select id,left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'),''),'Cliente'),90)
 from auth.users on conflict(id) do nothing;

-- Audit writes are transactional; no credential, Pix key or OCR text is logged.
create function triunfo_private.audit_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if triunfo_private.is_admin() then
  insert into public.triunfo_audit_events(actor_id,action,target_id)
  values(auth.uid(),tg_table_name || '.' || lower(tg_op),
   coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id','settings'));
 end if;
 if tg_op = 'DELETE' then return old; end if;
 return new;
end; $$;
create trigger triunfo_products_audit after insert or update or delete on public.triunfo_products
for each row execute function triunfo_private.audit_admin();
create trigger triunfo_settings_audit after update on public.triunfo_settings
for each row execute function triunfo_private.audit_admin();
create trigger triunfo_suggestions_audit after update on public.triunfo_suggestions
for each row execute function triunfo_private.audit_admin();

-- All exposed tables use RLS, with explicit grants (works with automatic exposure disabled).
alter table public.triunfo_profiles enable row level security;
alter table public.triunfo_products enable row level security;
alter table public.triunfo_votes enable row level security;
alter table public.triunfo_suggestions enable row level security;
alter table public.triunfo_cart_items enable row level security;
alter table public.triunfo_orders enable row level security;
alter table public.triunfo_order_items enable row level security;
alter table public.triunfo_receipts enable row level security;
alter table public.triunfo_settings enable row level security;
alter table public.triunfo_audit_events enable row level security;
alter table triunfo_private.admins enable row level security;
create policy profiles_read on public.triunfo_profiles for select to authenticated
 using(id=auth.uid() or triunfo_private.is_admin());
create policy profiles_edit on public.triunfo_profiles for update to authenticated
 using(id=auth.uid()) with check(id=auth.uid());
create policy products_read on public.triunfo_products for select to anon, authenticated
 using(status in ('available','voting') or triunfo_private.is_admin());
create policy products_admin on public.triunfo_products for all to authenticated
 using(triunfo_private.is_admin()) with check(triunfo_private.is_admin());
create policy votes_read on public.triunfo_votes for select to authenticated
 using(user_id=auth.uid() or triunfo_private.is_admin());
create policy suggestions_read on public.triunfo_suggestions for select to authenticated
 using(user_id=auth.uid() or triunfo_private.is_admin());
create policy suggestions_add on public.triunfo_suggestions for insert to authenticated
 with check(user_id=auth.uid() and status='pending');
create policy suggestions_admin on public.triunfo_suggestions for update to authenticated
 using(triunfo_private.is_admin()) with check(triunfo_private.is_admin());
create policy cart_own on public.triunfo_cart_items for all to authenticated
 using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy orders_read on public.triunfo_orders for select to authenticated
 using(user_id=auth.uid() or triunfo_private.is_admin());
create policy items_read on public.triunfo_order_items for select to authenticated
 using(exists(select 1 from public.triunfo_orders o where o.id=order_id
 and (o.user_id=auth.uid() or triunfo_private.is_admin())));
create policy receipts_read on public.triunfo_receipts for select to authenticated
 using(user_id=auth.uid() or triunfo_private.is_admin());
create policy settings_read on public.triunfo_settings for select to anon,authenticated using(true);
create policy settings_admin on public.triunfo_settings for update to authenticated
 using(triunfo_private.is_admin()) with check(triunfo_private.is_admin());
create policy audit_admin on public.triunfo_audit_events for select to authenticated
 using(triunfo_private.is_admin());

revoke all on public.triunfo_profiles, public.triunfo_products, public.triunfo_votes,
 public.triunfo_suggestions, public.triunfo_cart_items, public.triunfo_orders,
 public.triunfo_order_items, public.triunfo_receipts, public.triunfo_settings,
 public.triunfo_audit_events from public,anon,authenticated;
grant select on public.triunfo_products,public.triunfo_settings to anon,authenticated;
grant select on public.triunfo_profiles,public.triunfo_votes,public.triunfo_suggestions,
 public.triunfo_cart_items,public.triunfo_orders,public.triunfo_order_items,
 public.triunfo_receipts,public.triunfo_audit_events to authenticated;
grant update(display_name,photo) on public.triunfo_profiles to authenticated;
grant insert(name,price_cents,status,stock,image,emoji),
 update(name,price_cents,status,stock,image,emoji) on public.triunfo_products to authenticated;
-- Products are archived instead of physically removed, preserving votes and orders.
grant insert(user_id,name,image) on public.triunfo_suggestions to authenticated;
grant update(status) on public.triunfo_suggestions to authenticated;
grant insert,update,delete on public.triunfo_cart_items to authenticated;
grant update(store,pix) on public.triunfo_settings to authenticated;
grant select on public.triunfo_orders to service_role;

-- Aggregates reveal totals, never voter identities.
create function public.triunfo_vote_totals()
returns table(product_id uuid,yes bigint,no bigint)
language sql stable security definer set search_path = '' as $$
 select v.product_id,count(*) filter(where v.favorable),count(*) filter(where not v.favorable)
 from public.triunfo_votes v join public.triunfo_products p on p.id=v.product_id
 where p.status in ('available','voting') or triunfo_private.is_admin()
 group by v.product_id;
$$;
create function public.triunfo_cast_vote(p_product uuid,p_favorable boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_votes bigint; v_yes bigint; v_threshold bigint;
begin
 if auth.uid() is null or p_favorable is null or triunfo_private.is_admin() then
  raise exception 'Entre com uma conta de cliente'; end if;
 perform 1 from public.triunfo_products where id=p_product and status='voting' for update;
 if not found then raise exception 'Produto fora de votação'; end if;
 insert into public.triunfo_votes(user_id,product_id,favorable) values(auth.uid(),p_product,p_favorable);
 select count(*),count(*) filter(where favorable) into v_votes,v_yes
 from public.triunfo_votes where product_id=p_product;
 select greatest(1,ceil(count(*) * 0.5)) into v_threshold from public.triunfo_profiles p
 where not exists(select 1 from triunfo_private.admins a where a.user_id=p.id);
 if v_votes >= v_threshold and v_yes * 2 >= v_votes then
  update public.triunfo_products set status='viability' where id=p_product;
 end if;
end; $$;

-- Prices and stock are read on the server, under row locks in UUID order.
-- A stable request UUID makes network retries idempotent.
create function public.triunfo_create_order(p_items jsonb,p_request uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_item record; v_product public.triunfo_products%rowtype;
 v_total bigint := 0; v_payload jsonb; v_count integer := 0;
begin
 if auth.uid() is null then raise exception 'Entre para comprar'; end if;
 if p_request is null or p_items is null or jsonb_typeof(p_items)<>'array'
 then raise exception 'Carrinho inválido'; end if;
 if jsonb_array_length(p_items) not between 1 and 30 then raise exception 'Carrinho inválido'; end if;
 -- Serialize checkout retries for this user before checking the request key.
 perform 1 from public.triunfo_profiles where id=auth.uid() for update;
 select id into v_id from public.triunfo_orders where user_id=auth.uid() and request_id=p_request;
 if found then return v_id; end if;
 for v_item in select * from jsonb_array_elements(p_items) loop
  if jsonb_typeof(v_item.value)<>'object' or jsonb_typeof(v_item.value->'qty') is distinct from 'number'
   or (v_item.value->>'qty') !~ '^[0-9]{1,2}$'
   or (v_item.value->>'qty')::int not between 1 and 99
   or v_item.value->>'id' is null then raise exception 'Quantidade ou produto inválido'; end if;
 end loop;
 select jsonb_agg(jsonb_build_object('id',id,'qty',qty) order by id) into v_payload
 from (select (value->>'id')::uuid id,sum((value->>'qty')::int) qty
       from jsonb_array_elements(p_items) group by (value->>'id')::uuid) s;
 v_id := gen_random_uuid();
 for v_item in select * from jsonb_to_recordset(v_payload) as t(id uuid,qty integer) order by id loop
  if v_item.qty > 99 then raise exception 'Quantidade excede 99'; end if;
  select * into v_product from public.triunfo_products where id=v_item.id for update;
  if not found or v_product.status<>'available' or v_product.stock < v_item.qty
  then raise exception 'Produto indisponível ou estoque insuficiente'; end if;
  v_total := v_total + v_product.price_cents::bigint*v_item.qty;
  v_count := v_count+1;
 end loop;
 if v_count=0 or v_total not between 1 and 100000000 then raise exception 'Total inválido'; end if;
 insert into public.triunfo_orders(id,user_id,request_id,total_cents)
 values(v_id,auth.uid(),p_request,v_total);
 for v_item in select * from jsonb_to_recordset(v_payload) as t(id uuid,qty integer) loop
  insert into public.triunfo_order_items(order_id,product_id,name,qty,unit_price_cents)
  select v_id,id,name,v_item.qty,price_cents from public.triunfo_products where id=v_item.id;
  update public.triunfo_products set stock=stock-v_item.qty where id=v_item.id;
 end loop;
 delete from public.triunfo_cart_items where user_id=auth.uid();
 return v_id;
end; $$;

create function public.triunfo_cancel_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.triunfo_orders%rowtype; v_item record;
begin
 select * into v_order from public.triunfo_orders where id=p_order for update;
 if not found or auth.uid() is null or
  (v_order.user_id<>auth.uid() and not triunfo_private.is_admin())
 then raise exception 'Pedido indisponível'; end if;
 if v_order.status='cancelled' then return; end if;
 if not triunfo_private.is_admin() and (v_order.status<>'awaiting_receipt' or
  exists(select 1 from public.triunfo_receipts where order_id=p_order))
 then raise exception 'Cancelamento exige análise administrativa'; end if;
 if v_order.status='confirmed' then raise exception 'Pedido confirmado exige análise de reembolso'; end if;
 for v_item in select * from public.triunfo_order_items where order_id=p_order order by product_id loop
  update public.triunfo_products set stock=stock+v_item.qty where id=v_item.product_id;
 end loop;
 update public.triunfo_orders set status='cancelled',updated_at=now() where id=p_order;
 insert into public.triunfo_audit_events(actor_id,action,target_id)
 values(auth.uid(),'order.cancel',p_order::text);
end; $$;

-- Only trusted server ingestion may register a file hash. No client-provided hash.
create function public.triunfo_register_receipt(p_id uuid,p_order uuid,p_user uuid,p_hash text,p_name text,p_mime text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_order public.triunfo_orders%rowtype;
begin
 perform 1 from public.triunfo_profiles where id=p_user for update;
 select * into v_order from public.triunfo_orders where id=p_order and user_id=p_user for update;
 if not found or v_order.status in ('confirmed','cancelled') then raise exception 'Pedido indisponível'; end if;
 if (select count(*) from public.triunfo_receipts where order_id=p_order)>=10
 or (select count(*) from public.triunfo_receipts where user_id=p_user and created_at>now()-interval '1 day')>=50
 then raise exception 'Limite de comprovantes atingido'; end if;
 insert into public.triunfo_receipts(id,order_id,user_id,object_path,sha256,original_name,mime_type)
 values(p_id,p_order,p_user,p_user::text||'/'||p_id::text,p_hash,p_name,p_mime);
 update public.triunfo_orders set status='under_review',updated_at=now() where id=p_order;
 return p_id;
end; $$;

-- OCR output is provisional. The client is never permitted to write amount/status.
create function public.triunfo_record_receipt_reading(p_receipt uuid,p_amount integer,p_text text,p_transaction text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order uuid; v_total bigint; v_sum bigint; v_inconclusive boolean;
begin
 select order_id into v_order from public.triunfo_receipts where id=p_receipt;
 if not found then raise exception 'Comprovante indisponível'; end if;
 perform 1 from public.triunfo_orders where id=v_order and status not in ('confirmed','cancelled') for update;
 if not found then raise exception 'Pedido encerrado'; end if;
 update public.triunfo_receipts set recognized_cents=p_amount,ocr_text=left(p_text,10000),
 transaction_id=nullif(upper(trim(p_transaction)),''),
 status=case when p_amount is null then 'unreadable' else 'read' end where id=p_receipt;
 select coalesce(sum(recognized_cents),0),
 coalesce(bool_or(status in ('pending_review','unreadable')),false)
 into v_sum,v_inconclusive from public.triunfo_receipts where order_id=v_order and status<>'rejected';
 select total_cents into v_total from public.triunfo_orders where id=v_order;
 update public.triunfo_orders set recognized_cents=v_sum,
 status=case when v_inconclusive or v_sum>v_total then 'manual_review'
  when v_sum<v_total then 'amount_pending' else 'amount_matches' end,updated_at=now()
 where id=v_order;
end; $$;

-- Administrator may enter a verified reading after examining a private receipt.
create function public.triunfo_admin_read_receipt(p_receipt uuid,p_amount integer,p_transaction text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not triunfo_private.is_admin() then raise exception 'Acesso restrito'; end if;
 perform public.triunfo_record_receipt_reading(p_receipt,p_amount,'Leitura manual pelo administrador',p_transaction);
 insert into public.triunfo_audit_events(actor_id,action,target_id)
 values(auth.uid(),'receipt.manual_read',p_receipt::text);
end; $$;
create function public.triunfo_confirm_payment(p_order uuid,p_bank_checked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not triunfo_private.is_admin() or p_bank_checked is distinct from true then raise exception 'Confira o recebimento bancário'; end if;
 update public.triunfo_orders set status='confirmed',updated_at=now()
 where id=p_order and status='amount_matches';
 if not found then raise exception 'Pedido sem valor compatível'; end if;
 insert into public.triunfo_audit_events(actor_id,action,target_id)
 values(auth.uid(),'payment.bank_confirmed',p_order::text);
end; $$;

-- Bucket is private and browser upload is denied. Edge Function validates bytes.
create function public.triunfo_review_suggestion(p_suggestion uuid,p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_suggestion public.triunfo_suggestions%rowtype;
begin
 if not triunfo_private.is_admin() or p_accept is null then raise exception 'Acesso restrito'; end if;
 select * into v_suggestion from public.triunfo_suggestions where id=p_suggestion and status='pending' for update;
 if not found then raise exception 'Sugestão já analisada ou indisponível'; end if;
 if p_accept then
  insert into public.triunfo_products(name,image,status) values(v_suggestion.name,v_suggestion.image,'voting');
 end if;
 update public.triunfo_suggestions set status=case when p_accept then 'accepted' else 'rejected' end where id=p_suggestion;
end; $$;
revoke all on function public.triunfo_review_suggestion(uuid,boolean) from public,anon,authenticated;
grant execute on function public.triunfo_review_suggestion(uuid,boolean) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('triunfo-receipts','triunfo-receipts',false,5242880,
 array['image/jpeg','image/png','image/webp']);
create policy triunfo_receipt_files_read on storage.objects for select to authenticated
using(bucket_id='triunfo-receipts' and exists(
 select 1 from public.triunfo_receipts r where r.object_path=name
 and (r.user_id=auth.uid() or triunfo_private.is_admin())));

-- RPCs default to no PUBLIC execution, including security-definer helpers.
revoke all on all functions in schema triunfo_private from public,anon,authenticated;
grant execute on function triunfo_private.is_admin() to anon,authenticated;
revoke all on function public.triunfo_is_admin(),public.triunfo_vote_totals(),
 public.triunfo_cast_vote(uuid,boolean),public.triunfo_create_order(jsonb,uuid),
 public.triunfo_cancel_order(uuid),public.triunfo_register_receipt(uuid,uuid,uuid,text,text,text),
 public.triunfo_record_receipt_reading(uuid,integer,text,text),
 public.triunfo_admin_read_receipt(uuid,integer,text),public.triunfo_confirm_payment(uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.triunfo_is_admin() to authenticated;
grant execute on function public.triunfo_vote_totals() to anon,authenticated;
grant execute on function public.triunfo_cast_vote(uuid,boolean),
 public.triunfo_create_order(jsonb,uuid),public.triunfo_cancel_order(uuid),
 public.triunfo_admin_read_receipt(uuid,integer,text),public.triunfo_confirm_payment(uuid,boolean)
 to authenticated;
grant execute on function public.triunfo_register_receipt(uuid,uuid,uuid,text,text,text),
 public.triunfo_record_receipt_reading(uuid,integer,text,text) to service_role;

-- Only publish tables whose contents clients are allowed to read under RLS.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['triunfo_products','triunfo_orders','triunfo_settings','triunfo_cart_items'] loop
   execute format('alter publication supabase_realtime add table public.%I',t);
  end loop;
 end if;
end $$;
commit;
