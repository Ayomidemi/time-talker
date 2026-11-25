-- Run against a disposable database after installing the email account migrations.
-- This transaction rolls back all test account and commitment data.
begin;
insert into public.email_accounts(email, display_name) values ('hold-test-a@example.com', 'Original'), ('hold-test-b@example.com', 'Other');
do $$
declare result jsonb;
begin
  result := public.update_email_display_name('HOLD-TEST-A@example.com', ' Updated ');
  assert result->>'name' = 'Updated', 'Name normalization';
  assert (select display_name from public.email_accounts where email = 'hold-test-a@example.com') = 'Updated', 'Name persistence';
  result := public.change_email_commitment('hold-test-a@example.com', '2026-11-23', 'add', '00000000-0000-4000-8000-000000000001', 'Read');
  assert jsonb_array_length(result) = 1, 'Add returns saved row';
  assert result->0->>'day' = '2026-11-23', 'Day round trip';
  assert jsonb_array_length(public.email_commitments_for_day('hold-test-b@example.com', '2026-11-23')) = 0, 'Email separation';
  assert jsonb_array_length(public.email_commitments_for_day('hold-test-a@example.com', '2026-11-24')) = 1, 'Older commitments stay visible';
  perform public.change_email_commitment('hold-test-b@example.com', '2026-11-23', 'delete', '00000000-0000-4000-8000-000000000001');
  assert jsonb_array_length(public.email_commitments_for_day('hold-test-a@example.com', '2026-11-23')) = 1, 'Other account cannot remove row';
  result := public.change_email_commitment('hold-test-a@example.com', '2026-11-25', 'update', '00000000-0000-4000-8000-000000000001', null, true);
  assert (result->0->>'done')::boolean, 'Older item can be completed today';
  assert result->0->>'day' = '2026-11-23', 'Original creation day preserved';
  perform public.change_email_commitment('hold-test-a@example.com', '2026-11-23', 'add', '00000000-0000-4000-8000-000000000001', 'Read');
  assert jsonb_array_length(public.email_commitments_for_day('hold-test-a@example.com', '2026-11-23')) = 1, 'Add retry is idempotent';
  perform public.change_email_commitment('hold-test-a@example.com', '2026-11-23', 'add', '00000000-0000-4000-8000-000000000002', 'Write');
  perform public.change_email_commitment('hold-test-a@example.com', '2026-11-23', 'add', '00000000-0000-4000-8000-000000000003', 'Walk');
  result := public.change_email_commitment('hold-test-a@example.com', '2026-11-23', 'add', '00000000-0000-4000-8000-000000000004', 'Fourth', null, '2026-11-24 10:30:00+01');
  assert jsonb_array_length(result) = 4, 'No three-commitment limit';
  assert (select due_at from public.email_commitments where id = '00000000-0000-4000-8000-000000000004') = '2026-11-24 09:30:00Z'::timestamptz, 'Deadline instant persisted';
  assert (select due_at is null from public.email_commitments where id = '00000000-0000-4000-8000-000000000001'), 'Deadline is optional';
  assert (select (item->>'dueAt')::timestamptz = '2026-11-24 09:30:00Z'::timestamptz from jsonb_array_elements(result) item where item->>'id' = '00000000-0000-4000-8000-000000000004'), 'Deadline returned to client';
  result := public.change_email_commitment('hold-test-a@example.com', '2026-11-25', 'delete', '00000000-0000-4000-8000-000000000001');
  assert jsonb_array_length(result) = 3, 'Delete persisted';
  assert not has_table_privilege('anon', 'public.email_commitments', 'SELECT'), 'No unrestricted table reads';
  assert has_function_privilege('anon', 'public.email_commitments_for_day(text,date)', 'EXECUTE'), 'Email lookup permitted';
end;
$$;
rollback;
select 'SQL checks passed' as result;
