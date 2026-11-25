-- MFW-45 (backlog 2.4): race-safe server write path for creations.
-- Requires 20261124000000_mfw12_creations_public_private.sql. Applied by the owner (open question 17). Never applied by CI.
-- Clients (anon / authenticated) get no access: only the Next.js server calls these functions with the service-role key.
-- Occupancy of a zone = every stored, non-expired row of it, whatever its moderation status, so un-hiding an item can
-- never push a zone over the cap (owner decision 4: 80 per zone) or onto another krathong (owner decision 25).

create function public.mfw_zone_item_counts(p_event_id text)
returns table (zone_id integer, item_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.zone_id, count(p.id)::integer
  from public.creations_public as p
  where p.event_id = p_event_id
    and p.expires_at > now()
  group by p.zone_id
  order by p.zone_id;
$$;

create function public.mfw_zone_occupants(p_event_id text, p_zone_id integer)
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
    and p.expires_at > now()
  order by p.created_at, p.id;
$$;

-- Compare-and-insert: the server chose zone and spot from p_expected_occupant_ids (read with mfw_zone_occupants).
-- Under a per-zone advisory lock, the row is written only if the zone still holds exactly those rows and fewer than 80.
-- Otherwise no row is returned and the server re-reads and retries (owner decision 25: two releases racing).
create function public.mfw_insert_creation_guarded(
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
  p_expected_occupant_ids uuid[]
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
  if p_public_wish_text is not null and p_private_wish_text is not null then
    raise exception 'a creation has a public or a private wish, not both' using errcode = '22023';
  end if;

  -- One writer per (event, zone) at a time; released at commit.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mfw_creation_zone:' || p_event_id || ':' || p_zone_id::text, 0)
  );

  select coalesce(array_agg(p.id order by p.id), array[]::uuid[])
    into v_current
    from public.creations_public as p
   where p.event_id = p_event_id
     and p.zone_id = p_zone_id
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

  insert into public.creations_public (event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at)
  values (p_event_id, p_zone_id, p_appearance, p_coord, p_public_wish_text, p_created_at, p_expires_at)
  returning id, event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at
  into v_row;

  insert into public.creations_private_ownership (creation_id, owner_token_hash, private_wish_text, private_wish_key_id)
  values (v_row.id, p_owner_token_hash, p_private_wish_text, p_private_wish_key_id);

  return next v_row;
end;
$$;

revoke all on function public.mfw_zone_item_counts(text) from public, anon, authenticated;
grant execute on function public.mfw_zone_item_counts(text) to service_role;
revoke all on function public.mfw_zone_occupants(text, integer) from public, anon, authenticated;
grant execute on function public.mfw_zone_occupants(text, integer) to service_role;
revoke all on function public.mfw_insert_creation_guarded(text, integer, jsonb, jsonb, text, timestamptz, timestamptz, text, text, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.mfw_insert_creation_guarded(text, integer, jsonb, jsonb, text, timestamptz, timestamptz, text, text, text, uuid[])
  to service_role;

notify pgrst, 'reload schema';
