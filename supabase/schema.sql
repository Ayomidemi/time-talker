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

create or replace function public.lookup_account(target_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  found_name text;
  confirmed_at timestamptz;
begin
  select coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)),
         u.email_confirmed_at
  into found_name, confirmed_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(target_email))
  limit 1;

  if found_name is null then
    return jsonb_build_object('exists', false);
  end if;

  return jsonb_build_object(
    'exists', true,
    'name', found_name,
    'confirmed', confirmed_at is not null
  );
end;
$$;

revoke all on function public.lookup_account(text) from public;
grant execute on function public.lookup_account(text) to anon, authenticated;
