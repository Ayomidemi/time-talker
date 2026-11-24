-- Run in a disposable database after the email preferences migration.
begin;
insert into public.email_accounts(email, display_name) values ('preferences-a@example.com', 'A'), ('preferences-b@example.com', 'B');
do $$
declare result jsonb;
begin
  result := public.email_preferences('preferences-a@example.com');
  assert result = '{"cadence":"half","intensity":"gentle","includePeriod":true,"enabled":true}'::jsonb, 'Defaults';
  perform public.email_preferences('PREFERENCES-A@example.com', '{"cadence":"quarter","enabled":false}'::jsonb);
  result := public.email_preferences('preferences-a@example.com', '{"intensity":"annoying","includePeriod":false}'::jsonb);
  assert result = '{"cadence":"quarter","intensity":"annoying","includePeriod":false,"enabled":false}'::jsonb, 'Partial updates preserve other fields';
  assert public.email_preferences('preferences-a@example.com') = result, 'Preferences persist';
  assert public.email_preferences('preferences-b@example.com')->>'enabled' = 'true', 'Accounts stay separate';
  begin
    perform public.email_preferences('preferences-a@example.com', '{"enabled":null}'::jsonb);
    raise exception using errcode = 'XX000', message = 'Invalid preference accepted';
  exception when raise_exception then assert sqlerrm = 'Invalid preferences'; end;
  begin
    perform public.email_preferences('preferences-a@example.com', '{"email":"other@example.com"}'::jsonb);
    raise exception using errcode = 'XX000', message = 'Unknown preference accepted';
  exception when raise_exception then assert sqlerrm = 'Invalid preferences'; end;
  assert public.email_preferences('preferences-a@example.com') = result, 'Invalid writes preserve saved values';
end;
$$;
rollback;
select 'Preference SQL checks passed' as result;
