-- MFW-31 (backlog 7.2): server-side read of one creation's ownership row for the owner proof.
-- Requires 20261124000000_mfw12_creations_public_private.sql. Applied by the owner (open question 17). Never applied by CI.
-- Only the Next.js server calls it, with the service-role key. It returns the stored SHA-256 owner hash and the encrypted
-- private wish of one non-expired creation (open question 10). The server compares the hash in constant time (open question 1)
-- and decrypts only after a match. Nothing here is granted to anon / authenticated; no table, policy or table grant changes.

create function public.mfw_creation_ownership(p_creation_id uuid)
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
    and p.expires_at > now();
$$;

revoke all on function public.mfw_creation_ownership(uuid) from public, anon, authenticated;
grant execute on function public.mfw_creation_ownership(uuid) to service_role;

notify pgrst, 'reload schema';
