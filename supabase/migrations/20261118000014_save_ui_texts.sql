-- T5.8: save the texts of both languages of a key in one call (SPEC 12.3 item 5). Either every change of the call is
-- stored or none is, because a function runs in the transaction of its call: the first failure undoes the rest.
--
-- The function is `security invoker`: it runs as the caller, so the policies of `ui_texts` still decide who may write
-- (an admin). The admin check at the top only gives a clear error to a person who is not one; a delete with no row to
-- see would otherwise succeed silently. EXECUTE is for `authenticated` only (D82): a visitor with no session cannot call it.
--
--   p_entries  [{"locale": "en", "key": "nav.flows", "value": "Pipelines"}, ...]   stored (insert or update)
--   p_resets   [{"locale": "vi", "key": "nav.flows"}, ...]                          removed (back to the default)
--
-- A bad locale, a bad key or an empty text raises the check error of the table (23514) and nothing of the call stays.
create function public.save_ui_texts(p_entries jsonb, p_resets jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
begin
  if not public.is_admin() then
    raise exception 'only an admin can edit texts' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_resets, '[]'::jsonb)) <> 'array' then
    raise exception 'entries and resets must be arrays' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    insert into public.ui_texts (locale, key, value)
    values (item ->> 'locale', item ->> 'key', coalesce(item ->> 'value', ''))
    on conflict (locale, key) do update set value = excluded.value;
  end loop;

  for item in select * from jsonb_array_elements(coalesce(p_resets, '[]'::jsonb)) loop
    delete from public.ui_texts where locale = item ->> 'locale' and key = item ->> 'key';
  end loop;
end $$;

revoke execute on function public.save_ui_texts(jsonb, jsonb) from public, anon;
grant execute on function public.save_ui_texts(jsonb, jsonb) to authenticated;
