/* Flexible schedule: weekly_days, biweekly_days, biweekly_anchor_week.
   Old columns (scheduled_weekdays, biweekly_weekday, biweekly_anchor_date)
   remain but are deprecated and unused. v_daily_hours.is_extra_day now
   reads the new columns (see live DB for full view definition). */
alter table timetrack.user_settings
  add column weekly_days          int[] not null default '{4,5,6}',
  add column biweekly_days        int[] not null default '{3}',
  add column biweekly_anchor_week date  not null default '2026-10-12',
  add constraint weekly_days_valid   check (weekly_days   <@ '{1,2,3,4,5,6,7}'),
  add constraint biweekly_days_valid check (biweekly_days <@ '{1,2,3,4,5,6,7}'),
  add constraint day_sets_disjoint   check (not (weekly_days && biweekly_days)),
  add constraint anchor_is_monday    check (extract(isodow from biweekly_anchor_week) = 1);
