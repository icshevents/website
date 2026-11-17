-- Save and update the public event together, preserving all existing booking safeguards.
begin;
create or replace function public.icsh_hub_save_live(p_token text,p_id uuid,p_version integer,p_slug text,p_content jsonb,p_image_key text default null,p_visibility text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare previous public.icsh_events;saved public.icsh_events;result jsonb;
begin
 perform public.icsh_hub_require(p_token);
 if p_visibility is not null and p_visibility not in ('published','hidden','archive') then raise exception using errcode='22023',message='Choose Published, Hidden or Archive';end if;
 if p_id is not null then select * into previous from public.icsh_events where id=p_id for update;end if;
 if p_image_key is not null and p_image_key !~ '^event-posters/[a-f0-9-]{36}[.](jpg|png|webp)$' then raise exception using errcode='22023',message='Invalid event poster';end if;
 result:=public.icsh_hub_save(p_token,p_id,p_version,p_slug,p_content,'draft');
 select * into saved from public.icsh_events where id=(result->>'id')::uuid;
 if p_image_key is not null then
  update public.icsh_events set draft=jsonb_set(draft,'{image}',to_jsonb('/api/events-image/'||id::text)),draft_image=p_image_key where id=saved.id returning * into saved;
  perform public.icsh_hub_audit(p_token,saved.id,'event.poster.updated','{}');
 elsif coalesce(p_content->>'image','')='' then
  update public.icsh_events set draft_image=null where id=saved.id returning * into saved;
 end if;
 result:=public.icsh_hub_publish(p_token,saved.id,saved.version,'publish');
 if p_visibility='hidden' then result:=public.icsh_hub_publish(p_token,saved.id,(result->>'version')::integer,'unpublish');
 elsif p_visibility='archive' then result:=public.icsh_hub_publish(p_token,saved.id,(result->>'version')::integer,'complete');
 elsif p_visibility is null then
  -- Backwards compatibility for older callers: preserve their existing availability.
  if previous.published_status='cancelled' then result:=public.icsh_hub_publish(p_token,saved.id,(result->>'version')::integer,'cancel');end if;
  if previous.published_status='completed' then result:=public.icsh_hub_publish(p_token,saved.id,(result->>'version')::integer,'complete');end if;
  if previous.archived then result:=public.icsh_hub_publish(p_token,saved.id,(result->>'version')::integer,'archive');
  elsif previous.published is not null and not previous.visible and previous.published_status<>'completed' then result:=public.icsh_hub_publish(p_token,saved.id,(result->>'version')::integer,'unpublish');end if;
 end if;
 perform public.icsh_hub_audit(p_token,saved.id,'event.saved',jsonb_build_object('version',result->'version','visible',result->'visible'));
 return result;
end $$;
revoke all on function public.icsh_hub_save_live(text,uuid,integer,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.icsh_hub_save_live(text,uuid,integer,text,jsonb,text,text) to service_role;

create or replace function public.icsh_hub_set_visibility(p_token text,p_id uuid,p_version integer,p_visibility text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare event public.icsh_events;result jsonb;
begin
 perform public.icsh_hub_require(p_token);select * into event from public.icsh_events where id=p_id for update;
 if event.id is null or event.version<>p_version then raise exception using errcode='40001',message='Event changed elsewhere. Reload before saving';end if;
 if p_visibility is null or p_visibility not in ('published','hidden','archive') then raise exception using errcode='22023',message='Choose Published, Hidden or Archive';end if;
 if p_visibility='hidden' then
  result:=public.icsh_hub_publish(p_token,event.id,event.version,'unpublish');
  update public.icsh_events set archived=false,published_status='published',status='published' where id=event.id returning to_jsonb(icsh_events.*) into result;
  perform public.icsh_hub_audit(p_token,event.id,'event.visibility.hidden','{}');return result;
 end if;
 return public.icsh_hub_save_live(p_token,event.id,event.version,event.slug,event.draft,null,p_visibility);
end $$;
revoke all on function public.icsh_hub_set_visibility(text,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.icsh_hub_set_visibility(text,uuid,integer,text) to service_role;
commit;
