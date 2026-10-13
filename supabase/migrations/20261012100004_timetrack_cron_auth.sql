/* Cron secret lives in Vault; the edge function verifies it through this
   service_role-only RPC. Vault secrets (created once, not in migrations):
     timetrack_cron_secret, timetrack_project_url */
create or replace function timetrack.check_cron_secret(p_secret text)
returns boolean
language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'timetrack_cron_secret'
      and decrypted_secret = p_secret
      and length(p_secret) >= 32
  );
$$;
revoke all on function timetrack.check_cron_secret(text) from public, anon, authenticated;
grant execute on function timetrack.check_cron_secret(text) to service_role;
grant execute on all functions in schema timetrack to service_role;
