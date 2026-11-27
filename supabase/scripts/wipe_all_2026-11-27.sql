-- MFW-117 (backlog 16.31): one-off wipe of every current row (owner, 2026-11-27: old data does not matter).
-- NOT a migration: it lives outside supabase/migrations and is never applied by CI. The owner runs it once,
-- in the Supabase SQL editor of the production project, following docs/runbooks/data-wipe.md.
-- Irreversible. Schema, functions, the view, RLS policies and grants are left untouched.
-- creations_private_ownership rows go by the MFW-12 foreign key (on delete cascade).

begin;

select
  (select count(id) from public.creations_public) as creations_public_before,
  (select count(creation_id) from public.creations_private_ownership) as creations_private_ownership_before;

delete from public.creations_public;

do $$
begin
  if exists (select 1 from public.creations_public)
     or exists (select 1 from public.creations_private_ownership) then
    raise exception 'wipe incomplete';
  end if;
end
$$;

select
  (select count(id) from public.creations_public) as creations_public_after,
  (select count(creation_id) from public.creations_private_ownership) as creations_private_ownership_after;

commit;
