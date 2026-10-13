/* Optional seed staging (example data). Rows here are imported into the first
   app user who taps "Import history" (timetrack.claim_seed()). Replace with your
   own history or leave empty. Format matches the CSV import in the original TRD:
   id, ISO-8601 timestamp, punch_type, is_assumed, assumption_notes. */
insert into timetrack.seed_punches (seed_id, punched_at, punch_type, is_assumed, assumption_notes) values
  (1,  '2026-01-05T08:00:00-07:00', 'clock_in',  false, null),
  (2,  '2026-01-05T12:00:00-07:00', 'lunch_out', false, null),
  (3,  '2026-01-05T12:30:00-07:00', 'lunch_in',  false, null),
  (4,  '2026-01-05T16:30:00-07:00', 'clock_out', false, null),
  (5,  '2026-01-06T08:00:00-07:00', 'clock_in',  true,  'Example: missing clock in assumed'),
  (6,  '2026-01-06T12:05:00-07:00', 'lunch_out', false, null),
  (7,  '2026-01-06T12:35:00-07:00', 'lunch_in',  false, null),
  (8,  '2026-01-06T16:30:00-07:00', 'clock_out', false, null)
on conflict (seed_id) do nothing;
