# Runbook — wipe all current data (MFW-117, 2026-11-27)

Why: on 2026-11-27 the owner said that old data does not matter, so every current row is deleted before the 16.32
data-scope migration is applied. The script runs once, **before** that migration. It is irreversible. This runbook
takes no backup (the owner said old data does not matter). The schema, functions, view, RLS policies and grants are
untouched.

## What it deletes

Every row of `creations_public`. The `creations_private_ownership` rows go by the on-delete cascade, and with them
every owner token hash and every encrypted private wish and private display name.

## Steps

1. **Check the project ref.** Open the Supabase dashboard. The project ref is the `<ref>` in
   `https://supabase.com/dashboard/project/<ref>`. It must equal the subdomain of the Production `SUPABASE_URL` on
   Vercel (`https://<ref>.supabase.co`). Do not paste the ref or any key into the repo, Jira or chat.
2. **Note the counts before.** In the SQL editor, run only the count query, and write down both numbers.

   ```sql
   select
     (select count(id) from public.creations_public) as creations_public_before,
     (select count(creation_id) from public.creations_private_ownership) as creations_private_ownership_before;
   ```

3. **Run the script.** Copy the whole `supabase/scripts/wipe_all_2026-11-27.sql` from `main`, paste it into a new
   SQL editor query and run it once. If the editor warns about a destructive query, confirm.
4. **Expected result.** No error. The last result shows `creations_public_after` and
   `creations_private_ownership_after` as 0 and 0. The SQL editor may show only the result of the last statement
   (`commit;`), for example "Success. No rows returned", instead of the after counts. That is not a failure: step 6
   re-runs the count query and must show 0 and 0.
5. **If it fails.** An error of `wipe incomplete` means the transaction rolled back and nothing was deleted. Any
   other error (for example `relation ... does not exist` means the wrong project) also leaves the data as it was.
   Stop, do not edit and re-run the script, and record the error in `docs/follow-ups.md`.
6. **Check again.** Run the count query again. Expect 0 and 0.
7. **Clear site data on the owner's devices.** On every browser and device that made a krathong on the production
   site, clear the site data for the production site in the browser settings. Their My Creations entries
   (`mfw:myCreations:v1`) now point at nothing. Clearing removes every `mfw:` LocalStorage entry of the site,
   including the device owner token.
8. **Record it.** Fill in the MFW-117 row of `docs/follow-ups.md`: date and time (+07), the counts before, and the
   counts after (0 and 0).
