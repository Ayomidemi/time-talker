-- Hold schema. Run this in the Supabase SQL editor.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  cadence text not null default 'half' check (cadence in ('off', 'half', 'quarter')),
  intensity text not null default 'gentle' check (intensity in ('gentle', 'annoying')),
  include_period boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  due_at timestamptz,
  done boolean not null default false,
  day date not null default (timezone('utc', now()))::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slot timestamptz not null,
  status text not null check (status in ('on_track', 'slacking', 'break')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists commitments_user_day_idx on public.commitments (user_id, day);
create index if not exists check_ins_user_slot_idx on public.check_ins (user_id, slot desc);

alter table public.profiles enable row level security;
alter table public.commitments enable row level security;
alter table public.check_ins enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

create policy "commitments_select_own" on public.commitments
  for select using (auth.uid() = user_id);
create policy "commitments_insert_own" on public.commitments
  for insert with check (auth.uid() = user_id);
create policy "commitments_update_own" on public.commitments
  for update using (auth.uid() = user_id);
create policy "commitments_delete_own" on public.commitments
  for delete using (auth.uid() = user_id);

create policy "check_ins_select_own" on public.check_ins
  for select using (auth.uid() = user_id);
create policy "check_ins_insert_own" on public.check_ins
  for insert with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop function if exists public.lookup_account(text);

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
