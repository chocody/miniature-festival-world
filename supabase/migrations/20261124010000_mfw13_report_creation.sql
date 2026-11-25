-- MFW-13 (backlog 2.3): report a public wish. Requires 20261124000000_mfw12_creations_public_private.sql.
-- Applied by the owner to the Supabase project (open question 17). Never applied by CI.
-- Open question 3 (owner): an item is auto-hidden when report_count reaches 3. The MFW-12 view already hides
-- rows with report_count >= 3 or a status other than approved; this function also marks them flagged.
-- One UPDATE statement: concurrent reports re-check the WHERE clause on the locked row, so the count stops at 3.

create function public.mfw_report_creation(p_creation_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
begin
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
     and p.expires_at > now()
     and o.moderation_status = 'approved'
     and o.report_count < 3;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.mfw_report_creation(uuid) from public, anon, authenticated;
grant execute on function public.mfw_report_creation(uuid) to service_role;

notify pgrst, 'reload schema';
