begin;

create function public.triunfo_participant_names(p_ids uuid[])
returns table(id uuid, display_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
 if not triunfo_private.is_admin() then
  raise exception 'Consulta restrita à administração' using errcode = '42501';
 end if;
 if cardinality(p_ids) > 100 then
  raise exception 'Consulte até 100 contas por vez';
 end if;
 return query
 select p.id, left(coalesce(
  nullif(nullif(btrim(p.display_name), ''), 'Cliente'),
  nullif(btrim(u.raw_user_meta_data->>'full_name'), ''),
  nullif(btrim(u.raw_user_meta_data->>'name'), ''),
  p.display_name
 ), 90)
 from public.triunfo_profiles p
 join auth.users u on u.id = p.id
 where p.id = any(p_ids)
  and (exists(select 1 from public.triunfo_suggestions s where s.user_id = p.id)
    or exists(select 1 from public.triunfo_votes v where v.user_id = p.id));
end;
$$;

revoke all on function public.triunfo_participant_names(uuid[]) from public, anon, authenticated;
grant execute on function public.triunfo_participant_names(uuid[]) to authenticated;

commit;
