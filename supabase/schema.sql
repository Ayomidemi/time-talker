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

-- Email profile updates and cloud commitments.
-- Run after 20261123_email_accounts.sql. Email-only access remains unverified.
begin;
create table if not exists public.email_commitments (
  id uuid primary key default gen_random_uuid(),
  email text not null references public.email_accounts(email) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  done boolean not null default false,
  day date not null,
  created_at timestamptz not null default now()
);
create index if not exists email_commitments_email_day_idx on public.email_commitments(email, day);
alter table public.email_commitments enable row level security;
revoke all on public.email_commitments from anon, authenticated;

create or replace function public.update_email_display_name(target_email text, target_name text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare saved_name text;
begin
  if target_name is null or length(btrim(target_name)) not between 1 and 40 then
    raise exception 'Name must be between 1 and 40 characters';
  end if;
  update public.email_accounts set display_name = btrim(target_name)
  where email = lower(btrim(target_email)) returning display_name into saved_name;
  if not found then raise exception 'Account not found'; end if;
  return jsonb_build_object('name', saved_name);
end;
$$;

create or replace function public.email_commitments_for_day(target_email text, target_day date)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'done', done, 'day', day,
    'createdAt', created_at, 'dueAt', null
  ) order by created_at, id), '[]'::jsonb)
  from public.email_commitments
  where email = lower(btrim(target_email)) and day = target_day;
$$;

create or replace function public.change_email_commitment(
  target_email text, target_day date, operation text, item_id uuid,
  item_title text default null, item_done boolean default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare normalized_email text := lower(btrim(target_email));
begin
  if target_day is null or item_id is null then raise exception 'Day and ID are required'; end if;
  -- Serialize mutations for this account so concurrent devices cannot exceed the limit.
  perform 1 from public.email_accounts where email = normalized_email for update;
  if not found then raise exception 'Account not found'; end if;
  if operation = 'add' then
    if item_title is null or length(btrim(item_title)) not between 1 and 120 then
      raise exception 'Title must be between 1 and 120 characters';
    end if;
    -- Retrying a completed request with the same ID is harmless.
    if not exists (select 1 from public.email_commitments where id = item_id and email = normalized_email and day = target_day) then
      if (select count(*) from public.email_commitments where email = normalized_email and day = target_day) >= 3 then
        raise exception 'You can have up to three commitments per day';
      end if;
      insert into public.email_commitments(id, email, title, day) values(item_id, normalized_email, btrim(item_title), target_day);
    end if;
  elsif operation = 'update' then
    if item_done is null then raise exception 'Done is required'; end if;
    update public.email_commitments set done = item_done
    where id = item_id and email = normalized_email and day = target_day;
    if not found then raise exception 'Commitment no longer exists. Refresh your list'; end if;
  elsif operation = 'delete' then
    delete from public.email_commitments where id = item_id and email = normalized_email and day = target_day;
  else
    raise exception 'Invalid operation';
  end if;
  return public.email_commitments_for_day(normalized_email, target_day);
end;
$$;
revoke all on function public.update_email_display_name(text, text) from public;
revoke all on function public.email_commitments_for_day(text, date) from public;
revoke all on function public.change_email_commitment(text, date, text, uuid, text, boolean) from public;
grant execute on function public.update_email_display_name(text, text) to anon, authenticated;
grant execute on function public.email_commitments_for_day(text, date) to anon, authenticated;
grant execute on function public.change_email_commitment(text, date, text, uuid, text, boolean) to anon, authenticated;
commit;

-- Run after 20261123_profile_commitments.sql. Existing rows retain a null deadline.
begin;
alter table public.email_commitments add column if not exists due_at timestamptz;
-- Replace the old overload so calls without a deadline also use the unlimited version.
drop function if exists public.change_email_commitment(text, date, text, uuid, text, boolean);
create or replace function public.email_commitments_for_day(target_email text, target_day date)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'done', done, 'day', day,
    'createdAt', created_at, 'dueAt', due_at
  ) order by created_at, id), '[]'::jsonb)
  from public.email_commitments
  where email = lower(btrim(target_email)) and day = target_day;
$$;

create or replace function public.change_email_commitment(
  target_email text, target_day date, operation text, item_id uuid,
  item_title text default null, item_done boolean default null, item_due_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare normalized_email text := lower(btrim(target_email));
begin
  if target_day is null or item_id is null then raise exception 'Day and ID are required'; end if;
  -- Serialize account mutations and preserve idempotent retries.
  perform 1 from public.email_accounts where email = normalized_email for update;
  if not found then raise exception 'Account not found'; end if;
  if operation = 'add' then
    if item_title is null or length(btrim(item_title)) not between 1 and 120 then
      raise exception 'Title must be between 1 and 120 characters';
    end if;
    -- Retrying a completed request with the same ID is harmless.
    if not exists (select 1 from public.email_commitments where id = item_id and email = normalized_email and day = target_day) then
      insert into public.email_commitments(id, email, title, day, due_at) values(item_id, normalized_email, btrim(item_title), target_day, item_due_at);
    end if;
  elsif operation = 'update' then
    if item_done is null then raise exception 'Done is required'; end if;
    update public.email_commitments set done = item_done
    where id = item_id and email = normalized_email and day = target_day;
    if not found then raise exception 'Commitment no longer exists. Refresh your list'; end if;
  elsif operation = 'delete' then
    delete from public.email_commitments where id = item_id and email = normalized_email and day = target_day;
  else
    raise exception 'Invalid operation';
  end if;
  return public.email_commitments_for_day(normalized_email, target_day);
end;
$$;
revoke all on function public.email_commitments_for_day(text, date) from public;
revoke all on function public.change_email_commitment(text, date, text, uuid, text, boolean, timestamptz) from public;
grant execute on function public.email_commitments_for_day(text, date) to anon, authenticated;
grant execute on function public.change_email_commitment(text, date, text, uuid, text, boolean, timestamptz) to anon, authenticated;
commit;
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
