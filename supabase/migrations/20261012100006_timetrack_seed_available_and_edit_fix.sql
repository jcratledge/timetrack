create or replace function timetrack.seed_available()
returns int language sql security definer set search_path = '' stable as $$
  select count(*)::int from timetrack.seed_punches where claimed_by is null;
$$;
revoke all on function timetrack.seed_available() from public, anon;
grant execute on function timetrack.seed_available() to authenticated;
/* tg_time_entries_biu also updated: correcting a sweep punch sets source = 'manual'. */
