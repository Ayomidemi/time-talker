-- Show all saved commitments; dates organize records but do not hide them.
-- Run after 20261123_commitment_deadlines.sql. No rows are deleted or moved.
begin;
create or replace function public.email_commitments_for_day(target_email text, target_day date)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'done', done, 'day', day,
    'createdAt', created_at, 'dueAt', due_at
  ) order by created_at, id), '[]'::jsonb)
  from public.email_commitments
  where email = lower(btrim(target_email));
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
    where id = item_id and email = normalized_email;
    if not found then raise exception 'Commitment no longer exists. Refresh your list'; end if;
  elsif operation = 'delete' then
    delete from public.email_commitments where id = item_id and email = normalized_email;
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
