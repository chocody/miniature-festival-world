-- MFW-62 (backlog 12.1): wish visibility switch and display name.
-- Requires 20261124000000_mfw12_creations_public_private.sql and 20261124020000_mfw45_guarded_creation_insert.sql.
-- Applied by the owner (open question 17) BEFORE the MFW-62 build is deployed. Never applied by CI.
-- Owner decisions 29 and 36 (2026-11-25): the owner can open or close a wish at any time; an open wish shows its optional
-- display name and its text to everyone; a wish hidden by reports or moderation can never be opened again.
-- Exactly one store at a time: open = public_wish_text / display_name on creations_public; closed = AES-256-GCM ciphertexts
-- private_wish_text / private_display_name (both under private_wish_key_id) on creations_private_ownership.
-- Clients (anon / authenticated) get nothing: RLS stays on, every new function is granted to service_role only.
-- Existing functions are not changed; they keep working while the deploy switches over (display_name defaults to null).

-- 1. Columns
alter table public.creations_public
  add column display_name text
    constraint creations_public_display_name_not_blank check (display_name is null or btrim(display_name) <> '');

alter table public.creations_public
  add constraint creations_public_display_name_needs_wish check (display_name is null or public_wish_text is not null);

alter table public.creations_private_ownership
  add column private_display_name text
    constraint creations_private_display_name_ciphertext_format check (
      private_display_name is null or private_display_name ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$'
    );

alter table public.creations_private_ownership
  add constraint creations_private_display_name_needs_wish check (private_display_name is null or private_wish_text is not null);

-- 2. Access stays closed (re-asserted; the restrictive deny policies of MFW-12 are unchanged).
alter table public.creations_public enable row level security;
alter table public.creations_private_ownership enable row level security;
revoke all on table public.creations_public from public, anon, authenticated;
revoke all on table public.creations_private_ownership from public, anon, authenticated;

-- 3. Public view: the MFW-12 columns unchanged and in order, display_name appended at the end.
-- CREATE OR REPLACE keeps the grants; the security_invoker option must be restated or it is reset.
create or replace view public.creations_public_visible
  with (security_invoker = true)
as
select p.id, p.event_id, p.zone_id, p.appearance, p.coord, p.public_wish_text, p.created_at, p.expires_at, p.display_name
from public.creations_public as p
join public.creations_private_ownership as o on o.creation_id = p.id
where o.moderation_status = 'approved'
  and o.report_count < 3
  and p.expires_at > now();

revoke all on table public.creations_public_visible from public, anon, authenticated;
grant select on table public.creations_public_visible to service_role;

-- 4. Guarded insert with a display name. New name (no overload): mfw_insert_creation_guarded stays for the old deployment.
create function public.mfw_insert_creation_guarded_v2(
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
  p_private_display_name text
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
  if p_display_name is not null and p_public_wish_text is null then
    raise exception 'a public display name needs a public wish' using errcode = '22023';
  end if;
  if p_private_display_name is not null and p_private_wish_text is null then
    raise exception 'a private display name needs a private wish' using errcode = '22023';
  end if;

  -- Same lock key as mfw_insert_creation_guarded, so both versions serialize while the deploy switches over.
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

  insert into public.creations_public (event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at, display_name)
  values (p_event_id, p_zone_id, p_appearance, p_coord, p_public_wish_text, p_created_at, p_expires_at, p_display_name)
  returning id, event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at, display_name
  into v_row;

  insert into public.creations_private_ownership (creation_id, owner_token_hash, private_wish_text, private_wish_key_id, private_display_name)
  values (v_row.id, p_owner_token_hash, p_private_wish_text, p_private_wish_key_id, p_private_display_name);

  return next v_row;
end;
$$;

-- 5. Switch state of one non-expired creation, for the owner proof. Server-only; never sent in any response.
create function public.mfw_creation_wish_state(p_creation_id uuid)
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
    and p.expires_at > now();
$$;

-- 6. Open: compare-and-set under row locks. The server has already proven ownership, decrypted and moderated the text.
create function public.mfw_open_creation_wish(
  p_creation_id uuid,
  p_expected_private_wish_text text,
  p_public_wish_text text,
  p_display_name text
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
  if p_expected_private_wish_text is null or p_public_wish_text is null then
    raise exception 'opening needs the expected ciphertext and the public text' using errcode = '22023';
  end if;

  select p.public_wish_text, o.private_wish_text, o.moderation_status, o.report_count
    into v_public_wish_text, v_private_wish_text, v_moderation_status, v_report_count
    from public.creations_private_ownership as o
    join public.creations_public as p on p.id = o.creation_id
   where o.creation_id = p_creation_id
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

-- 7. Close: compare-and-set under row locks. Allowed while hidden (closing only hides more).
create function public.mfw_close_creation_wish(
  p_creation_id uuid,
  p_expected_public_wish_text text,
  p_expected_display_name text,
  p_private_wish_text text,
  p_private_wish_key_id text,
  p_private_display_name text
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
  if p_expected_public_wish_text is null or p_private_wish_text is null or p_private_wish_key_id is null then
    raise exception 'closing needs the expected public text and the new ciphertext' using errcode = '22023';
  end if;

  select p.public_wish_text, p.display_name, o.private_wish_text
    into v_public_wish_text, v_display_name, v_private_wish_text
    from public.creations_private_ownership as o
    join public.creations_public as p on p.id = o.creation_id
   where o.creation_id = p_creation_id
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

-- 8. Service role only.
revoke all on function public.mfw_insert_creation_guarded_v2(text, integer, jsonb, jsonb, text, timestamptz, timestamptz, text, text, text, uuid[], text, text)
  from public, anon, authenticated;
grant execute on function public.mfw_insert_creation_guarded_v2(text, integer, jsonb, jsonb, text, timestamptz, timestamptz, text, text, text, uuid[], text, text)
  to service_role;
revoke all on function public.mfw_creation_wish_state(uuid) from public, anon, authenticated;
grant execute on function public.mfw_creation_wish_state(uuid) to service_role;
revoke all on function public.mfw_open_creation_wish(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.mfw_open_creation_wish(uuid, text, text, text) to service_role;
revoke all on function public.mfw_close_creation_wish(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.mfw_close_creation_wish(uuid, text, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
