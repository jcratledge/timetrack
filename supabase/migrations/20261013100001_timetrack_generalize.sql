/* Generalize for any hourly worker (applied 2026-10-13 in three parts:
   timetrack_generalize_settings, timetrack_day_boundary_and_view, timetrack_account_merge).
   New columns on user_settings: setup_completed, week_start_dow, day_start_hour,
   pay_frequency, pay_period_anchor, ot_multiplier, daily_ot_enabled/after,
   daily_dt_enabled/after, dt_multiplier, holiday_multiplier, schedule_enabled,
   auto_lunch_enabled, auto_lunch_min_shift_hours, missing_punch_mode.
   New tables: day_overrides (holidays), merge_tokens (anonymous to email merge).
   New functions: work_date_for, tg_settings_rebucket, create_merge_token, claim_merge.
   Updated: tg_time_entries_biu, record_punch (overnight day boundary), v_daily_hours (+ is_holiday).
   See the live database for exact definitions. */
