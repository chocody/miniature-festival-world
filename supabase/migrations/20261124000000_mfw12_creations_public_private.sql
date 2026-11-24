-- MFW-12 (backlog 2.2): public/private separated creations storage.
-- Applied by the owner to the Supabase project (open question 17). Never applied by CI.
-- Clients (anon / authenticated) have no access at all: every read and write goes through the Next.js
-- server with the service-role key (invariants C and D).

create type public.moderation_status as enum ('approved', 'flagged', 'hidden');

create table public.creations_public (
  id uuid primary key default gen_random_uuid(),
  event_id text not null
    constraint creations_public_event_id_known check (event_id in (
      'loy_krathong', 'christmas', 'new_year', 'chinese_new_year',
      'valentines', 'songkran', 'mid_autumn', 'halloween'
    )),
  zone_id integer not null
    constraint creations_public_zone_id_min check (zone_id >= 1),
  appearance jsonb not null
    constraint creations_public_appearance_object check (jsonb_typeof(appearance) = 'object'),
  coord jsonb not null
    constraint creations_public_coord_parametric check (
      jsonb_typeof(coord) = 'object'
      and coord ->> 'mode' is not null
      and coord ->> 'mode' in ('SPLINE_PATH', 'CYLINDRICAL_SURFACE', 'PLANAR_ZONE')
      and not (coord ?| array['x', 'y', 'z', 'position'])
    ),
  public_wish_text text
    constraint creations_public_wish_not_blank check (public_wish_text is null or btrim(public_wish_text) <> ''),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint creations_public_expires_after_created check (expires_at > created_at)
);

create index creations_public_event_zone_created_idx
  on public.creations_public (event_id, zone_id, created_at, id);

create table public.creations_private_ownership (
  creation_id uuid primary key
    references public.creations_public (id) on delete cascade,
  owner_token_hash text not null
    constraint creations_private_owner_hash_format check (owner_token_hash ~ '^[0-9a-f]{64}$'),
  private_wish_text text
    constraint creations_private_wish_ciphertext_format check (
      private_wish_text is null or private_wish_text ~ '^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$'
    ),
  private_wish_key_id text
    constraint creations_private_wish_key_id_format check (
      private_wish_key_id is null or private_wish_key_id ~ '^[a-z0-9][a-z0-9_-]{0,31}$'
    ),
  report_count integer not null default 0
    constraint creations_private_report_count_min check (report_count >= 0),
  moderation_status public.moderation_status not null default 'approved',
  constraint creations_private_wish_key_pair check ((private_wish_text is null) = (private_wish_key_id is null))
);

-- Invariant D: RLS on every table; clients get no rows and no privileges.
alter table public.creations_public enable row level security;
alter table public.creations_private_ownership enable row level security;

create policy creations_public_deny_clients on public.creations_public
  as restrictive for all to anon, authenticated using (false) with check (false);
create policy creations_private_ownership_deny_clients on public.creations_private_ownership
  as restrictive for all to anon, authenticated using (false) with check (false);

revoke all on table public.creations_public from public, anon, authenticated;
revoke all on table public.creations_private_ownership from public, anon, authenticated;
grant select, insert, update, delete on table public.creations_public to service_role;
grant select, insert, update, delete on table public.creations_private_ownership to service_role;

-- Open question 3: public reads exclude hidden / flagged items and items at the auto-hide threshold (3 reports);
-- open question 10: expired rows are never served (the deletion job is a follow-up).
create view public.creations_public_visible
  with (security_invoker = true)
as
select p.id, p.event_id, p.zone_id, p.appearance, p.coord, p.public_wish_text, p.created_at, p.expires_at
from public.creations_public as p
join public.creations_private_ownership as o on o.creation_id = p.id
where o.moderation_status = 'approved'
  and o.report_count < 3
  and p.expires_at > now();

revoke all on table public.creations_public_visible from public, anon, authenticated;
grant select on table public.creations_public_visible to service_role;

-- Atomic write of one creation: public row + private ownership row in one transaction.
-- Returns only the public row. Called by the server write path (MFW-45) through PostgREST RPC.
create function public.mfw_insert_creation(
  p_event_id text,
  p_zone_id integer,
  p_appearance jsonb,
  p_coord jsonb,
  p_public_wish_text text,
  p_expires_at timestamptz,
  p_owner_token_hash text,
  p_private_wish_text text,
  p_private_wish_key_id text
)
returns public.creations_public
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.creations_public;
begin
  if p_public_wish_text is not null and p_private_wish_text is not null then
    raise exception 'a creation has a public or a private wish, not both' using errcode = '22023';
  end if;

  insert into public.creations_public (event_id, zone_id, appearance, coord, public_wish_text, expires_at)
  values (p_event_id, p_zone_id, p_appearance, p_coord, p_public_wish_text, p_expires_at)
  returning id, event_id, zone_id, appearance, coord, public_wish_text, created_at, expires_at
  into v_row;

  insert into public.creations_private_ownership (creation_id, owner_token_hash, private_wish_text, private_wish_key_id)
  values (v_row.id, p_owner_token_hash, p_private_wish_text, p_private_wish_key_id);

  return v_row;
end;
$$;

revoke all on function public.mfw_insert_creation(text, integer, jsonb, jsonb, text, timestamptz, text, text, text)
  from public, anon, authenticated;
grant execute on function public.mfw_insert_creation(text, integer, jsonb, jsonb, text, timestamptz, text, text, text)
  to service_role;

notify pgrst, 'reload schema';
