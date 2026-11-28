-- MFW-118 (backlog 16.32): data-scope column. Test and live rows share one Supabase project (owner, 2026-11-27).
-- Requires the five earlier migrations, applied in order MFW-12 -> MFW-13 -> MFW-45 -> MFW-31 -> MFW-62.
-- Applied by the owner (open question 17) on production after the MFW-117 wipe, BEFORE this card is merged and
-- before the MFW-119 build is deployed. Never applied by CI. Runbook: docs/runbooks/migrations.md.
-- Clients (anon / authenticated) get nothing: RLS stays on, the MFW-12 restrictive deny policies are unchanged, and
-- every new function is granted to service_role only.
-- Existing functions are not changed; they keep working while the deploy switches over. A writer that names no scope
-- writes 'test', so it never reaches the live site.
-- Each new function is a copy of its old version with p_data_scope (no default) as the last parameter and a scope
-- filter next to the expiry filter. The plpgsql functions reject an unknown scope; the sql readers return no rows.

-- 1. Column
alter table public.creations_public
  add column data_scope text not null default 'test'
    constraint creations_public_data_scope_known check (data_scope in ('live', 'test'));

-- 2. Scope-first index (the MFW-12 index stays; the old functions use it).
create index creations_public_scope_event_zone_created_idx
  on public.creations_public (data_scope, event_id, zone_id, created_at, id);

-- 3. Access stays closed (re-asserted; the restrictive deny policies of MFW-12 are unchanged).
alter table public.creations_public enable row level security;
alter table public.creations_private_ownership enable row level security;
revoke all on table public.creations_public from public, anon, authenticated;
revoke all on table public.creations_private_ownership from public, anon, authenticated;

-- 4. Public view: the MFW-62 columns unchanged and in order, data_scope appended at the end. No scope filter here.
-- CREATE OR REPLACE keeps the grants; the security_invoker option must be restated or it is reset.
create or replace view public.creations_public_visible
  with (security_invoker = true)
as
select p.id, p.event_id, p.zone_id, p.appearance, p.coord, p.public_wish_text, p.created_at, p.expires_at, p.display_name, p.data_scope
from public.creations_public as p
join public.creations_private_ownership as o on o.creation_id = p.id
where o.moderation_status = 'approved'
  and o.report_count < 3
  and p.expires_at > now();

revoke all on table public.creations_public_visible from public, anon, authenticated;
grant select on table public.creations_public_visible to service_role;

-- 5. Scoped functions (new names, no overloads; the old functions stay for the deployed build).
create function public.mfw_zone_item_counts_v2(p_event_id text, p_data_scope text)
returns table (zone_id integer, item_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.zone_id, count(p.id)::integer
  from public.creations_public as p
  where p.event_id = p_event_id
    and p.data_scope = p_data_scope
    and p.expires_at > now()
  group by p.zone_id
  order by p.zone_id;
$$;

create function public.mfw_zone_occupants_v2(p_event_id text, p_zone_id integer, p_data_scope text)
returns table (id uuid, coord jsonb, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.coord, p.created_at
  from public.creations_public as p
  where p.event_id = p_event_id
    and p.zone_id = p_zone_id
    and p.data_scope = p_data_scope
    and p.expires_at > now()
  order by p.created_at, p.id;
$$;

create function public.mfw_insert_creation_guarded_v3(
  p_event_id text,
  p_zone_id integer,
  p_appearance jsonb,
  p_coord jsonb,
  p_public_wish_text text,
  p_created_at timestamptz,
  p_expires_at timestamptz,
  p_owner_token_hash text,
  p_private_wish_text text,
  p_private_wish_key_id text,
  p_expected_occupant_ids uuid[],
  p_display_name text,
  p_private_display_name text,
  p_data_scope text
)
returns setof public.creations_public
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current uuid[];
  v_expected uuid[];
  v_row public.creations_public;
begin
  if p_data_scope is null or p_data_scope not in ('live', 'test') then
    raise exception 'unknown data scope' using errcode = '22023';
  end if;
  if p_public_wish_text is not null and p_private_wish_text is not null then
    raise exception 'a creation has a public or a private wish, not both' using errcode = '22023';
  end if;
  if p_display_name is not null and p_public_wish_text is null then
    raise exception 'a public display name needs a public wish' using errcode = '22023';
  end if;
  if p_private_display_name is not null and p_private_wish_text is null then
    raise exception 'a private display name needs a private wish' using errcode = '22023';
  end if;

  -- Same lock key as mfw_insert_creation_guarded_v2 (no scope), so old and new writers serialise during the switch-over.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mfw_creation_zone:' || p_event_id || ':' || p_zone_id::text, 0)
  );

  select coalesce(array_agg(p.id order by p.id), array[]::uuid[])
    into v_current
    from public.creations_public as p
   where p.event_id = p_event_id
     and p.zone_id = p_zone_id
     and p.data_scope = p_data_scope
     and p.expires_at > now();

  select coalesce(array_agg(e.occupant_id order by e.occupant_id), array[]::uuid[])
    into v_expected
    from unnest(p_expected_occupant_ids) as e(occupant_id);

  if v_current is distinct from v_expected then
    return;
  end if;

  -- Owner decision 4: at most 80 creations per zone.
  if pg_catalog.cardinality(v_current) >= 80 then
    return;
  end if;

  insert into public.creations_public (event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at, display_name, data_scope)
  values (p_event_id, p_zone_id, p_appearance, p_coord, p_public_wish_text, p_created_at, p_expires_at, p_display_name, p_data_scope)
  returning id, event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at, display_name, data_scope
  into v_row;

  insert into public.creations_private_ownership (creation_id, owner_token_hash, private_wish_text, private_wish_key_id, private_display_name)
  values (v_row.id, p_owner_token_hash, p_private_wish_text, p_private_wish_key_id, p_private_display_name);

  return next v_row;
end;
$$;

create function public.mfw_creation_ownership_v2(p_creation_id uuid, p_data_scope text)
returns table (owner_token_hash text, private_wish_text text, private_wish_key_id text)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.owner_token_hash, o.private_wish_text, o.private_wish_key_id
  from public.creations_private_ownership as o
  join public.creations_public as p on p.id = o.creation_id
  where o.creation_id = p_creation_id
    and p.data_scope = p_data_scope
    and p.expires_at > now();
$$;

create function public.mfw_creation_wish_state_v2(p_creation_id uuid, p_data_scope text)
returns table (
  owner_token_hash text,
  public_wish_text text,
  display_name text,
  private_wish_text text,
  private_wish_key_id text,
  private_display_name text,
  hidden boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.owner_token_hash, p.public_wish_text, p.display_name, o.private_wish_text, o.private_wish_key_id,
         o.private_display_name, (o.moderation_status <> 'approved' or o.report_count >= 3)
  from public.creations_private_ownership as o
  join public.creations_public as p on p.id = o.creation_id
  where o.creation_id = p_creation_id
    and p.data_scope = p_data_scope
    and p.expires_at > now();
$$;

create function public.mfw_open_creation_wish_v2(
  p_creation_id uuid,
  p_expected_private_wish_text text,
  p_public_wish_text text,
  p_display_name text,
  p_data_scope text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_public_wish_text text;
  v_private_wish_text text;
  v_moderation_status public.moderation_status;
  v_report_count integer;
begin
  if p_data_scope is null or p_data_scope not in ('live', 'test') then
    raise exception 'unknown data scope' using errcode = '22023';
  end if;
  if p_expected_private_wish_text is null or p_public_wish_text is null then
    raise exception 'opening needs the expected ciphertext and the public text' using errcode = '22023';
  end if;

  select p.public_wish_text, o.private_wish_text, o.moderation_status, o.report_count
    into v_public_wish_text, v_private_wish_text, v_moderation_status, v_report_count
    from public.creations_private_ownership as o
    join public.creations_public as p on p.id = o.creation_id
   where o.creation_id = p_creation_id
     and p.data_scope = p_data_scope
     and p.expires_at > now()
     for update of o, p;
  if not found then
    return false;
  end if;

  -- Owner decision 36: a wish hidden by reports or moderation is never opened again.
  if v_moderation_status <> 'approved' or v_report_count >= 3 then
    return false;
  end if;
  -- Still closed, and still holding the ciphertext the server decrypted and moderated.
  if v_public_wish_text is not null or v_private_wish_text is distinct from p_expected_private_wish_text then
    return false;
  end if;

  update public.creations_private_ownership
     set private_wish_text = null,
         private_wish_key_id = null,
         private_display_name = null
   where creation_id = p_creation_id;

  update public.creations_public
     set public_wish_text = p_public_wish_text,
         display_name = p_display_name
   where id = p_creation_id;

  return true;
end;
$$;

create function public.mfw_close_creation_wish_v2(
  p_creation_id uuid,
  p_expected_public_wish_text text,
  p_expected_display_name text,
  p_private_wish_text text,
  p_private_wish_key_id text,
  p_private_display_name text,
  p_data_scope text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_public_wish_text text;
  v_display_name text;
  v_private_wish_text text;
begin
  if p_data_scope is null or p_data_scope not in ('live', 'test') then
    raise exception 'unknown data scope' using errcode = '22023';
  end if;
  if p_expected_public_wish_text is null or p_private_wish_text is null or p_private_wish_key_id is null then
    raise exception 'closing needs the expected public text and the new ciphertext' using errcode = '22023';
  end if;

  select p.public_wish_text, p.display_name, o.private_wish_text
    into v_public_wish_text, v_display_name, v_private_wish_text
    from public.creations_private_ownership as o
    join public.creations_public as p on p.id = o.creation_id
   where o.creation_id = p_creation_id
     and p.data_scope = p_data_scope
     and p.expires_at > now()
     for update of o, p;
  if not found then
    return false;
  end if;

  if v_private_wish_text is not null
     or v_public_wish_text is distinct from p_expected_public_wish_text
     or v_display_name is distinct from p_expected_display_name then
    return false;
  end if;

  update public.creations_public
     set public_wish_text = null,
         display_name = null
   where id = p_creation_id;

  update public.creations_private_ownership
     set private_wish_text = p_private_wish_text,
         private_wish_key_id = p_private_wish_key_id,
         private_display_name = p_private_display_name
   where creation_id = p_creation_id;

  return true;
end;
$$;

create function public.mfw_report_creation_v2(p_creation_id uuid, p_data_scope text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if p_data_scope is null or p_data_scope not in ('live', 'test') then
    raise exception 'unknown data scope' using errcode = '22023';
  end if;
  update public.creations_private_ownership as o
     set report_count = o.report_count + 1,
         moderation_status = case
           when o.report_count + 1 >= 3 then 'flagged'::public.moderation_status
           else o.moderation_status
         end
    from public.creations_public as p
   where o.creation_id = p_creation_id
     and p.id = o.creation_id
     and p.public_wish_text is not null
     and p.data_scope = p_data_scope
     and p.expires_at > now()
     and o.moderation_status = 'approved'
     and o.report_count < 3;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

-- 6. Privileges: clients revoked, service_role only.
revoke all on function public.mfw_zone_item_counts_v2(text, text) from public, anon, authenticated;
grant execute on function public.mfw_zone_item_counts_v2(text, text) to service_role;
revoke all on function public.mfw_zone_occupants_v2(text, integer, text) from public, anon, authenticated;
grant execute on function public.mfw_zone_occupants_v2(text, integer, text) to service_role;
revoke all on function public.mfw_insert_creation_guarded_v3(text, integer, jsonb, jsonb, text, timestamptz, timestamptz, text, text, text, uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.mfw_insert_creation_guarded_v3(text, integer, jsonb, jsonb, text, timestamptz, timestamptz, text, text, text, uuid[], text, text, text) to service_role;
revoke all on function public.mfw_creation_ownership_v2(uuid, text) from public, anon, authenticated;
grant execute on function public.mfw_creation_ownership_v2(uuid, text) to service_role;
revoke all on function public.mfw_creation_wish_state_v2(uuid, text) from public, anon, authenticated;
grant execute on function public.mfw_creation_wish_state_v2(uuid, text) to service_role;
revoke all on function public.mfw_open_creation_wish_v2(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.mfw_open_creation_wish_v2(uuid, text, text, text, text) to service_role;
revoke all on function public.mfw_close_creation_wish_v2(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.mfw_close_creation_wish_v2(uuid, text, text, text, text, text, text) to service_role;
revoke all on function public.mfw_report_creation_v2(uuid, text) from public, anon, authenticated;
grant execute on function public.mfw_report_creation_v2(uuid, text) to service_role;

-- 7. Reload the PostgREST schema cache.
notify pgrst, 'reload schema';
