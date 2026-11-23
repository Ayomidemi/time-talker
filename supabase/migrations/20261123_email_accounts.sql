-- Email-only profiles are deliberately unverified. Activity remains browser-local.
-- Keep these separate from authenticated users and their private RLS-protected data.
create table if not exists public.email_accounts (
  email text primary key check (email = lower(btrim(email)) and length(email) <= 254),
  display_name text not null check (length(btrim(display_name)) between 1 and 40),
  created_at timestamptz not null default now()
);
alter table public.email_accounts enable row level security;
revoke all on public.email_accounts from anon, authenticated;

-- Preserve names for accounts created with the previous email-link flow.
insert into public.email_accounts (email, display_name)
select lower(btrim(u.email)), left(coalesce(
  nullif(btrim(p.display_name), ''),
  nullif(btrim(u.raw_user_meta_data->>'name'), ''),
  split_part(u.email, '@', 1)
), 40)
from auth.users u
left join public.profiles p on p.id = u.id
where u.email is not null and length(btrim(u.email)) between 3 and 254
on conflict (email) do nothing;

create or replace function public.enter_email_account(target_email text, target_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  normalized_email text := lower(btrim(target_email));
  normalized_name text := nullif(btrim(target_name), '');
  saved_name text;
begin
  if normalized_email is null or length(normalized_email) > 254
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Invalid email';
  end if;
  if length(normalized_name) > 40 then
    raise exception 'Name must be at most 40 characters';
  end if;

  select display_name into saved_name
  from public.email_accounts where email = normalized_email;
  if saved_name is not null then
    return jsonb_build_object('needs_name', false, 'name', saved_name);
  end if;
  if normalized_name is null then
    return jsonb_build_object('needs_name', true);
  end if;

  insert into public.email_accounts (email, display_name)
  values (normalized_email, normalized_name)
  on conflict (email) do nothing;
  -- A concurrent signup must not overwrite an existing account's saved name.
  select display_name into saved_name
  from public.email_accounts where email = normalized_email;
  return jsonb_build_object('needs_name', false, 'name', saved_name);
end;
$$;
revoke all on function public.enter_email_account(text, text) from public;
grant execute on function public.enter_email_account(text, text) to anon, authenticated;
