-- Run after the email accounts migration. Preferences belong to each email profile.
begin;
alter table public.email_accounts add column if not exists preferences jsonb not null
  default '{"cadence":"half","intensity":"gentle","includePeriod":true,"enabled":true}'::jsonb;

create or replace function public.email_preferences(target_email text, changes jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare result jsonb;
begin
  if changes is null or jsonb_typeof(changes) <> 'object' then raise exception 'Invalid preferences'; end if;
  if exists (select 1 from jsonb_object_keys(changes) k where k not in ('cadence','intensity','includePeriod','enabled'))
    or (changes ? 'cadence' and (jsonb_typeof(changes->'cadence') <> 'string' or changes->>'cadence' not in ('off','half','quarter')))
    or (changes ? 'intensity' and (jsonb_typeof(changes->'intensity') <> 'string' or changes->>'intensity' not in ('gentle','annoying')))
    or (changes ? 'includePeriod' and jsonb_typeof(changes->'includePeriod') <> 'boolean')
    or (changes ? 'enabled' and jsonb_typeof(changes->'enabled') <> 'boolean') then
    raise exception 'Invalid preferences';
  end if;
  if changes = '{}'::jsonb then
    select preferences into result from public.email_accounts where email = lower(btrim(target_email));
  else
    -- Merge only changed fields, preserving edits to other fields on another device.
    update public.email_accounts set preferences = preferences || changes
      where email = lower(btrim(target_email)) returning preferences into result;
  end if;
  if not found then raise exception 'Account not found'; end if;
  return result;
end;
$$;
revoke all on function public.email_preferences(text, jsonb) from public;
grant execute on function public.email_preferences(text, jsonb) to anon, authenticated;
commit;
