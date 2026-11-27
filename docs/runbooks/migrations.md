# Runbook — Supabase migrations (apply order and anon-key denial checklist)

The owner applies every migration in `supabase/migrations/` by hand in the Supabase SQL editor (open question 17).
CI never applies a migration and has no Supabase env. A migration PR labelled `owner-merge` is applied on production
**before** it is merged, so the merged code never runs against a schema that lacks it. After each migration, run the
anon-key denial checklist below and record the result in `docs/follow-ups.md`.

## Apply order

Apply in this order, each exactly once. A later file requires every earlier one.

1. MFW-12 — `20261124000000_mfw12_creations_public_private.sql` (tables, RLS, restrictive deny policies, view).
2. MFW-13 — `20261124010000_mfw13_report_creation.sql` (report function).
3. MFW-45 — `20261124020000_mfw45_guarded_creation_insert.sql` (guarded insert, zone counts and occupants).
4. MFW-31 — `20261125000000_mfw31_creation_ownership_read.sql` (ownership read).
5. MFW-62 — `20261126000000_mfw62_wish_visibility_switch.sql` (display name, wish open / close).
6. MFW-117 — the one-off `supabase/scripts/wipe_all_2026-11-27.sql` (`docs/runbooks/data-wipe.md`). Not a migration;
   it runs once, before step 7, and is never run again.
7. MFW-118 — `20261127000000_mfw118_data_scope.sql` (`data_scope` column, scope-first index, view, scoped functions).
8. Later migrations (16.9, 16.10, 16.34) are added here by their cards.

## Applying one migration

1. **Check the project ref.** Follow step 1 of `docs/runbooks/data-wipe.md`: the project ref in the dashboard URL
   must equal the subdomain of the Production `SUPABASE_URL` on Vercel. Never paste the ref or any key into the repo,
   Jira or chat.
2. **Wrap it in one transaction.** The migration files have no transaction of their own, and it is not confirmed
   that the SQL editor runs a query as one transaction. Without one, a file that fails part-way leaves its earlier
   statements applied. In a new SQL editor query, type `begin;` on the first line. Then paste the whole migration file
   from the PR branch, and type `commit;` on the last line:

   ```sql
   begin;
   -- the whole migration file, unchanged
   commit;
   ```

3. **Run it once.** Expected result: no error.
4. **If any error appears**, run `rollback;` in the SQL editor. Nothing of the file is applied. (After an error, Postgres turns the
   trailing `commit;` into a rollback, so `rollback;` may answer "there is no transaction in progress". That is
   fine. The verification query in step 5 then returns no row.) Do not edit the file.
   Record the error in `docs/follow-ups.md` on the card's row. Once a fix is pushed to the PR branch, retry from
   step 2.
5. **Verify the commit.** In a new query, run the card's short verification query. It must show the change. For
   MFW-118 this is the column query in "After MFW-118" below, which must return `text`, `NO`, `'test'::text`. If it
   returns no row, nothing was applied: treat it as step 4.
6. **Check.** Run the card's other checks (for MFW-118: the section below) and the anon-key denial checklist, then
   fill in the card's row in `docs/follow-ups.md` (date and time +07, checklist results).

## After MFW-118

Run in the SQL editor:

```sql
select data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'creations_public' and column_name = 'data_scope';
```

Expected: one row, `text`, `NO`, `'test'::text`.

```sql
select data_scope, event_id, count(id) from public.creations_public group by data_scope, event_id order by data_scope, event_id;
```

This is the per-scope count check. Expected right after the MFW-117 wipe: zero rows. Later it shows one row per
scope and event.

The deployed build from before MFW-119 keeps working: it calls the old functions, which are unchanged, and every row
it writes gets `data_scope = 'test'` from the column default.

## Anon-key denial checklist

Each query runs in the SQL editor and must return the stated result.

(a) No `mfw_` function is executable by a client role. Expected: 0 rows.

```sql
select p.oid::regprocedure as fn, r.rolname
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and p.proname like 'mfw\_%'
  and has_function_privilege(r.rolname, p.oid, 'execute');
```

(b) No client role can read or write the two tables or the view. Expected: 0 rows.

```sql
select t.relname, r.rolname, pr.privilege
from (values ('creations_public'), ('creations_private_ownership'), ('creations_public_visible')) as t(relname)
cross join (values ('anon'), ('authenticated')) as r(rolname)
cross join (values ('select'), ('insert'), ('update'), ('delete')) as pr(privilege)
where has_table_privilege(r.rolname, 'public.' || t.relname, pr.privilege);
```

(c) RLS is on for both tables, and the two MFW-12 deny policies are restrictive. Expected: two rows with
`relrowsecurity = true`, then two policy rows with `polpermissive = false`.

```sql
select c.relname, c.relrowsecurity
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('creations_public', 'creations_private_ownership');

select pol.polname, c.relname, pol.polpermissive
from pg_policy as pol
join pg_class as c on c.oid = pol.polrelid
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('creations_public', 'creations_private_ownership');
```

(d) No `mfw_` function is security definer or lacks a pinned search path. Expected: 0 rows.

```sql
select p.oid::regprocedure as fn, p.prosecdef, p.proconfig
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'mfw\_%'
  and (p.prosecdef or p.proconfig is null);
```

(e) Optional: an anon REST probe from the owner's own terminal. Set the URL and the anon key as shell variables in that
terminal only (never in a file, the repo, Jira or chat), for example `SB_URL` and `SB_ANON`, then:

```sh
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$SB_URL/rest/v1/rpc/mfw_zone_item_counts_v2" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $SB_ANON" -H 'Content-Type: application/json' \
  -d '{"p_event_id":"probe","p_data_scope":"test"}'
curl -s -o /dev/null -w '%{http_code}\n' "$SB_URL/rest/v1/creations_public?select=id" \
  -H "apikey: $SB_ANON" -H "Authorization: Bearer $SB_ANON"
```

Any argument values do for the probe. Repeat with any function name or relation from the table below (`/rest/v1/rpc/<name>`, `/rest/v1/<table>?select=id`).
No answer may be 200.

(f) Every relation and function and the expected result for `anon` and `authenticated`:

| Name | Kind | Since | Expected |
|---|---|---|---|
| `creations_public` | table | MFW-12 | denied |
| `creations_private_ownership` | table | MFW-12 | denied |
| `creations_public_visible` | view | MFW-12 | denied |
| `mfw_insert_creation` | function | MFW-12 | denied |
| `mfw_report_creation` | function | MFW-13 | denied |
| `mfw_insert_creation_guarded` | function | MFW-45 | denied |
| `mfw_zone_item_counts` | function | MFW-45 | denied |
| `mfw_zone_occupants` | function | MFW-45 | denied |
| `mfw_creation_ownership` | function | MFW-31 | denied |
| `mfw_insert_creation_guarded_v2` | function | MFW-62 | denied |
| `mfw_creation_wish_state` | function | MFW-62 | denied |
| `mfw_open_creation_wish` | function | MFW-62 | denied |
| `mfw_close_creation_wish` | function | MFW-62 | denied |
| `mfw_zone_item_counts_v2` | function | MFW-118 | denied |
| `mfw_zone_occupants_v2` | function | MFW-118 | denied |
| `mfw_insert_creation_guarded_v3` | function | MFW-118 | denied |
| `mfw_creation_ownership_v2` | function | MFW-118 | denied |
| `mfw_creation_wish_state_v2` | function | MFW-118 | denied |
| `mfw_open_creation_wish_v2` | function | MFW-118 | denied |
| `mfw_close_creation_wish_v2` | function | MFW-118 | denied |
| `mfw_report_creation_v2` | function | MFW-118 | denied |
