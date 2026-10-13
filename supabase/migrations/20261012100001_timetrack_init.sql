/* ==========================================================================
   timetrack : Time & Payroll Tracker
   Lives in its own schema inside the shared lz-apps project.
   Nothing here touches public.* or auth.users triggers, so other apps
   in this project are unaffected.

   Identity: Supabase Anonymous Sign-In, with optional email linking for
   recovery. Profile rows are created lazily by timetrack.ensure_profile().
   ========================================================================== */

create extension if not exists pgcrypto with schema extensions;

create schema if not exists timetrack;
grant usage on schema timetrack to authenticated, service_role;

/* ---------- Enums ---------- */
create type timetrack.punch_type   as enum ('clock_in', 'lunch_out', 'lunch_in', 'clock_out');
create type timetrack.punch_source as enum ('app', 'sweep', 'import', 'manual');

/* ==========================================================================
   user_settings : one row per user
   ========================================================================== */
create table timetrack.user_settings (
  user_id                   uuid primary key references auth.users(id) on delete cascade,
  display_name              text,
  timezone                  text         not null default 'America/Denver',

  /* Pay */
  regular_rate              numeric(8,2) not null default 18.00 check (regular_rate >= 0),
  overtime_rate             numeric(8,2) not null default 27.00 check (overtime_rate >= 0),
  overtime_threshold_hours  numeric(5,2) not null default 40.00 check (overtime_threshold_hours > 0),
  tax_rate                  numeric(5,4) not null default 0.2200 check (tax_rate between 0 and 1),
  payday_offset_days        int          not null default 5 check (payday_offset_days between 0 and 30),
                            /* days after Sunday week end: 5 = the following Friday */

  /* Sweep and assumption rules */
  sweep_time                time         not null default '00:00',
  assumed_clock_in          time         not null default '05:50',
  assumed_clock_out         time         not null default '18:10',
  assumed_lunch_minutes     int          not null default 30 check (assumed_lunch_minutes between 0 and 120),
  last_swept_date           date,

  /* Regular schedule, used only to flag "above and beyond" extra days.
     ISO weekdays: 1 = Mon ... 7 = Sun. Never affects pay. */
  scheduled_weekdays        int[]        not null default '{4,5,6}',   /* Thu, Fri, Sat */
  biweekly_weekday          int          default 3 check (biweekly_weekday between 1 and 7), /* Wed */
  biweekly_anchor_date      date         default '2026-10-14',  /* a known scheduled biweekly day */

  /* Future-proofing */
  offline_queue_enabled     boolean      not null default false,

  created_at                timestamptz  not null default now(),
  updated_at                timestamptz  not null default now()
);

/* ==========================================================================
   time_entries : one row per punch
   ========================================================================== */
create table timetrack.time_entries (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  punched_at           timestamptz not null,
  work_date            date not null,                 /* local date, set by trigger */
  punch_type           timetrack.punch_type not null,
  source               timetrack.punch_source not null default 'app',

  is_assumed           boolean not null default false,
  assumption_notes     text,

  terminal_id          text,                          /* optional UKG clock number */
  original_punched_at  timestamptz,
  edited_at            timestamptz,
  deleted_at           timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint assumed_requires_note check (not is_assumed or assumption_notes is not null),
  constraint sweep_rows_are_assumed check (source <> 'sweep' or is_assumed)
);

create index time_entries_user_day_idx
  on timetrack.time_entries (user_id, work_date, punched_at)
  where deleted_at is null;

create unique index time_entries_sweep_once_idx
  on timetrack.time_entries (user_id, work_date, punch_type)
  where source = 'sweep' and deleted_at is null;

/* ==========================================================================
   Seed staging : rows from the CSV, claimed once by the first app user
   ========================================================================== */
create table timetrack.seed_punches (
  seed_id           int primary key,
  punched_at        timestamptz not null,
  punch_type        timetrack.punch_type not null,
  is_assumed        boolean not null default false,
  assumption_notes  text,
  claimed_by        uuid references auth.users(id) on delete set null,
  claimed_at        timestamptz
);
/* RLS on with no policies: invisible to clients, reachable only via claim_seed() */

/* ==========================================================================
   Triggers
   ========================================================================== */
create or replace function timetrack.tg_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger user_settings_updated_at
  before update on timetrack.user_settings
  for each row execute function timetrack.tg_set_updated_at();

create or replace function timetrack.tg_time_entries_biu()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_tz text;
begin
  if tg_op = 'INSERT' or new.punched_at is distinct from old.punched_at then
    select s.timezone into v_tz from timetrack.user_settings s where s.user_id = new.user_id;
    new.work_date := (new.punched_at at time zone coalesce(v_tz, 'America/Denver'))::date;
  end if;

  if tg_op = 'UPDATE' and new.punched_at is distinct from old.punched_at then
    new.original_punched_at := coalesce(old.original_punched_at, old.punched_at);
    new.edited_at := now();
    if old.is_assumed and new.is_assumed then
      new.is_assumed := false;
      new.assumption_notes := old.assumption_notes || ' | corrected by user';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

create trigger time_entries_biu
  before insert or update on timetrack.time_entries
  for each row execute function timetrack.tg_time_entries_biu();

/* ==========================================================================
   RLS
   ========================================================================== */
alter table timetrack.user_settings enable row level security;
alter table timetrack.time_entries  enable row level security;
alter table timetrack.seed_punches  enable row level security;

create policy settings_select on timetrack.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy settings_update on timetrack.user_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy entries_select on timetrack.time_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy entries_insert on timetrack.time_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()) and source in ('app', 'manual') and not is_assumed);
create policy entries_update on timetrack.time_entries
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy entries_delete on timetrack.time_entries
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, update on timetrack.user_settings to authenticated;
grant select, insert, update, delete on timetrack.time_entries to authenticated;
grant all on all tables in schema timetrack to service_role;

/* ==========================================================================
   RPCs
   ========================================================================== */

/* Call on every app boot. Idempotent. */
create or replace function timetrack.ensure_profile()
returns timetrack.user_settings
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_row timetrack.user_settings;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  insert into timetrack.user_settings (user_id) values (v_uid)
  on conflict (user_id) do nothing;
  select * into v_row from timetrack.user_settings where user_id = v_uid;
  return v_row;
end $$;

/* One-time import of staged seed rows into the caller's history.
   Only succeeds if the staging rows are unclaimed. Returns rows copied. */
create or replace function timetrack.claim_seed()
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  perform timetrack.ensure_profile();

  with c as (
    update timetrack.seed_punches
       set claimed_by = v_uid, claimed_at = now()
     where claimed_by is null
    returning *
  )
  insert into timetrack.time_entries
    (user_id, punched_at, punch_type, source, is_assumed, assumption_notes)
  select v_uid, punched_at, punch_type, 'import', is_assumed, assumption_notes
  from c;

  get diagnostics v_n = row_count;
  return v_n;
end $$;

/* Server-validated punch state machine */
create or replace function timetrack.record_punch(
  p_type     timetrack.punch_type,
  p_terminal text default null
)
returns timetrack.time_entries
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_tz    text;
  v_today date;
  v_last  timetrack.punch_type;
  v_row   timetrack.time_entries;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select s.timezone into v_tz from timetrack.user_settings s where s.user_id = v_uid;
  v_today := (now() at time zone coalesce(v_tz, 'America/Denver'))::date;

  select e.punch_type into v_last
  from timetrack.time_entries e
  where e.user_id = v_uid and e.work_date = v_today and e.deleted_at is null
  order by e.punched_at desc
  limit 1;

  if not (
       ((v_last is null or v_last = 'clock_out') and p_type = 'clock_in')
    or (v_last = 'clock_in'  and p_type in ('lunch_out', 'clock_out'))
    or (v_last = 'lunch_out' and p_type = 'lunch_in')
    or (v_last = 'lunch_in'  and p_type = 'clock_out')
  ) then
    raise exception 'invalid transition % -> %', coalesce(v_last::text, 'none'), p_type
      using errcode = 'P0001';
  end if;

  insert into timetrack.time_entries (user_id, punched_at, punch_type, source, terminal_id)
  values (v_uid, now(), p_type, 'app', p_terminal)
  returning * into v_row;

  return v_row;
end $$;

revoke all on function timetrack.ensure_profile()                          from public, anon;
revoke all on function timetrack.claim_seed()                              from public, anon;
revoke all on function timetrack.record_punch(timetrack.punch_type, text)  from public, anon;
grant execute on function timetrack.ensure_profile()                         to authenticated;
grant execute on function timetrack.claim_seed()                             to authenticated;
grant execute on function timetrack.record_punch(timetrack.punch_type, text) to authenticated;

/* ==========================================================================
   Views
   ========================================================================== */
create or replace view timetrack.v_daily_hours with (security_invoker = true) as
with p as (
  select
    user_id, work_date, punch_type, punched_at, is_assumed,
    lead(punched_at) over w as next_at,
    lead(punch_type) over w as next_type
  from timetrack.time_entries
  where deleted_at is null
  window w as (partition by user_id, work_date order by punched_at)
),
d as (
  select
    user_id,
    work_date,
    coalesce(sum(
      case when punch_type in ('clock_in', 'lunch_in')
            and next_type in ('lunch_out', 'clock_out')
           then extract(epoch from next_at - punched_at) end
    ), 0) / 3600.0                                                    as raw_hours,
    bool_or(punch_type in ('lunch_out', 'lunch_in'))                 as has_lunch_punches,
    (bool_or(punch_type = 'clock_in') and bool_or(punch_type = 'clock_out')) as is_complete,
    bool_or(is_assumed)                                               as has_assumed_punch,
    count(*)                                                          as punch_count,
    min(punched_at)                                                   as first_punch_at,
    max(punched_at)                                                   as last_punch_at
  from p
  group by user_id, work_date
)
select
  d.user_id,
  d.work_date,
  (d.work_date - (extract(isodow from d.work_date)::int - 1))        as week_start,
  d.punch_count,
  d.first_punch_at,
  d.last_punch_at,
  d.is_complete,
  d.has_assumed_punch,
  (d.is_complete and not d.has_lunch_punches)                        as auto_lunch_applied,
  not (
       extract(isodow from d.work_date)::int = any (s.scheduled_weekdays)
    or (s.biweekly_weekday is not null
        and s.biweekly_anchor_date is not null
        and extract(isodow from d.work_date)::int = s.biweekly_weekday
        and mod(d.work_date - s.biweekly_anchor_date, 14) = 0)
  )                                                                   as is_extra_day,
  round(d.raw_hours, 4)                                               as raw_hours,
  round(greatest(
    d.raw_hours
    - case when d.is_complete and not d.has_lunch_punches
           then s.assumed_lunch_minutes / 60.0 else 0 end,
    0), 4)                                                            as net_hours
from d
join timetrack.user_settings s using (user_id);

create or replace view timetrack.v_weekly_pay with (security_invoker = true) as
with w as (
  select
    user_id,
    week_start,
    sum(net_hours)                                                    as total_hours,
    bool_or(has_assumed_punch or auto_lunch_applied)                  as has_assumptions,
    count(*) filter (where not is_complete)                           as incomplete_days,
    count(*) filter (where is_extra_day)                              as extra_days,
    round(coalesce(sum(net_hours) filter (where is_extra_day), 0), 2) as extra_day_hours
  from timetrack.v_daily_hours
  group by user_id, week_start
)
select
  w.user_id,
  w.week_start,
  w.week_start + 6                                                    as week_end,
  w.week_start + 6 + s.payday_offset_days                             as pay_date,
  round(w.total_hours, 2)                                             as total_hours,
  round(x.reg, 2)                                                     as regular_hours,
  round(x.ot, 2)                                                      as overtime_hours,
  round(x.reg * s.regular_rate + x.ot * s.overtime_rate, 2)           as gross_pay,
  round((x.reg * s.regular_rate + x.ot * s.overtime_rate) * (1 - s.tax_rate), 2) as net_pay,
  w.has_assumptions,
  w.incomplete_days,
  w.extra_days,
  w.extra_day_hours
from w
join timetrack.user_settings s using (user_id)
cross join lateral (
  select
    least(w.total_hours, s.overtime_threshold_hours)                  as reg,
    greatest(w.total_hours - s.overtime_threshold_hours, 0)           as ot
) x;

grant select on timetrack.v_daily_hours, timetrack.v_weekly_pay to authenticated;
