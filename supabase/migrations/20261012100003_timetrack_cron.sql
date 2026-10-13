/* timetrack-sweep schedule: every 15 min. The function decides per user
   whether their local sweep_time has passed, so changing sweep_time in
   Settings never requires touching this job.

   Requires Vault secrets (created once, outside migrations):
     timetrack_project_url  = https://<ref>.supabase.co
     timetrack_cron_secret  = same value as the TIMETRACK_CRON_SECRET function secret
*/

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'timetrack-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'timetrack_project_url')
               || '/functions/v1/timetrack-sweep',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'timetrack_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
