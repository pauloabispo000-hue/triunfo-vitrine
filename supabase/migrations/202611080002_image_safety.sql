begin;
create function triunfo_private.safe_image(value text) returns boolean
language sql immutable set search_path = '' as $$
 select value is null or value='' or
 value ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$' or
 value ~ '^https://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$' or
 value ~ '^assets/[A-Za-z0-9_./-]+$';
$$;
revoke all on function triunfo_private.safe_image(text) from public;
grant execute on function triunfo_private.safe_image(text) to authenticated,service_role;
alter table public.triunfo_profiles add constraint triunfo_profile_safe_photo check(triunfo_private.safe_image(photo));
alter table public.triunfo_products add constraint triunfo_product_safe_image check(triunfo_private.safe_image(image));
alter table public.triunfo_suggestions add constraint triunfo_suggestion_safe_image check(triunfo_private.safe_image(image));
alter table public.triunfo_products add constraint triunfo_product_safe_emoji check(emoji !~ '[<>&]');
-- Notify visible catalog subscribers after each vote; no voter data is published.
create function triunfo_private.vote_catalog_refresh() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 update public.triunfo_products set stock=stock where id=new.product_id;
 return new;
end; $$;
revoke all on function triunfo_private.vote_catalog_refresh() from public,anon,authenticated;
create trigger triunfo_vote_catalog_event after insert on public.triunfo_votes
for each row execute function triunfo_private.vote_catalog_refresh();
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.triunfo_profiles,public.triunfo_suggestions;
 end if;
end $$;
commit;
