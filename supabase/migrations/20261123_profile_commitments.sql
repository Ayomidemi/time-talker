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
