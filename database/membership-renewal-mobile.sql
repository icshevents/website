begin;
set local lock_timeout='5s';
create table public.icsh_membership_mobile_verifications(
 id uuid primary key,contact_id text not null check(contact_id ~ '^[1-9][0-9]{0,29}$'),email text not null check(email=lower(btrim(email)) and length(email)<=254),
 old_mobile text check(old_mobile ~ '^\+[1-9][0-9]{6,14}$'),new_mobile text not null check(new_mobile ~ '^\+[1-9][0-9]{6,14}$'),
 code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),attempts integer not null default 0 check(attempts between 0 and 5),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '10 minutes',
 delivery_status text not null default 'sending' check(delivery_status in ('sending','accepted','failed','review_required')),
 verified_at timestamptz,proof_hash text check(proof_hash ~ '^[a-f0-9]{64}$'),proof_until timestamptz,
 application_id uuid unique references public.icsh_membership_applications(id),
 mobile_status text not null default 'pending' check(mobile_status in ('pending','writing','confirmed','review_required')),
 claim_id uuid,confirmed_at timestamptz,
 check(new_mobile is distinct from old_mobile),check((verified_at is null)=(proof_hash is null)),check(application_id is null or verified_at is not null)
);
create index icsh_mobile_email_recent on public.icsh_membership_mobile_verifications(email,created_at desc);
alter table public.icsh_membership_mobile_verifications enable row level security;
revoke all on public.icsh_membership_mobile_verifications from public,anon,authenticated,service_role;
grant select,insert,update on public.icsh_membership_mobile_verifications to service_role;
create function public.icsh_membership_mobile_start(p_id uuid,p_contact text,p_email text,p_old text,p_new text,p_code_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('icsh-mobile:'||p_email,0));
 if p_id is null or p_contact is null or p_email is null or p_new is null or p_new is not distinct from p_old or p_code_hash is null then return false;end if;
 if (select count(*) from public.icsh_membership_mobile_verifications where email=p_email and created_at>now()-interval '24 hours')>=5 or exists(select 1 from public.icsh_membership_mobile_verifications where email=p_email and created_at>now()-interval '60 seconds')then return false;end if;
 -- Replace only unverified codes. Verified applications keep their durable proof.
 update public.icsh_membership_mobile_verifications set expires_at=least(expires_at,now()) where email=p_email and verified_at is null;
 insert into public.icsh_membership_mobile_verifications(id,contact_id,email,old_mobile,new_mobile,code_hash)values(p_id,p_contact,p_email,p_old,p_new,p_code_hash);
 return true;
end $$;
create function public.icsh_membership_mobile_verify(p_id uuid,p_code_hash text,p_proof_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v public.icsh_membership_mobile_verifications;
begin
 select * into v from public.icsh_membership_mobile_verifications where id=p_id for update;
 if v.id is null or v.delivery_status<>'accepted' or v.verified_at is not null or v.expires_at<=now() or v.attempts>=5 or p_code_hash is null or p_proof_hash is null or p_proof_hash!~'^[a-f0-9]{64}$' then return false;end if;
 update public.icsh_membership_mobile_verifications set attempts=attempts+1 where id=p_id;
 if v.code_hash<>p_code_hash then return false;end if;
 update public.icsh_membership_mobile_verifications set verified_at=now(),proof_hash=p_proof_hash,proof_until=now()+interval '30 minutes' where id=p_id;
 return true;
end $$;
create function public.icsh_membership_mobile_proof(p_id uuid,p_hash text,p_email text,p_mobile text,p_application uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.icsh_membership_mobile_verifications v where v.id=p_id and v.proof_hash=p_hash and v.verified_at is not null and v.email=p_email and v.new_mobile=p_mobile and
 ((v.application_id is null and v.proof_until>now()) or exists(select 1 from public.icsh_membership_applications a where a.id=v.application_id and a.deleted_at is null and a.completed_at is null and a.mode='live' and not a.test_data and public.icsh_membership_mobile_key(a.answers->>'mobile')=substr(p_mobile,2) and lower(btrim(a.answers->>'email'))=p_email)));
$$;
create function public.icsh_membership_mobile_bind()returns trigger language plpgsql security invoker set search_path='' as $$
declare v public.icsh_membership_mobile_verifications;requested uuid;
begin
 if new.answers->>'mobileVerificationId' is null then return new;end if;
 if tg_op='UPDATE' and old.answers->>'mobileVerificationId' is not distinct from new.answers->>'mobileVerificationId' then return new;end if;
 requested:=(new.answers->>'mobileVerificationId')::uuid;
 select * into v from public.icsh_membership_mobile_verifications where id=requested for update;
 if new.mode<>'live' or new.test_data or new.answers->>'kind' is distinct from 'renewal' or v.id is null or v.verified_at is null or v.proof_until<=now() or v.application_id is not null or v.email is distinct from lower(btrim(new.answers->>'email')) or substr(v.new_mobile,2) is distinct from public.icsh_membership_mobile_key(new.answers->>'mobile') then raise exception using errcode='22023',message='Mobile verification required';end if;
 update public.icsh_membership_mobile_verifications set application_id=new.id where id=v.id;
 return new;
end $$;
create trigger icsh_membership_mobile_bind after insert or update of answers on public.icsh_membership_applications for each row execute function public.icsh_membership_mobile_bind();
create function public.icsh_membership_mobile_claim(p_application uuid,p_claim uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.icsh_membership_applications;x public.icsh_membership_activations;v public.icsh_membership_mobile_verifications;
begin
 select * into a from public.icsh_membership_applications where id=p_application for update;
 select * into x from public.icsh_membership_activations where application_id=p_application for update;
 select * into v from public.icsh_membership_mobile_verifications where application_id=p_application for update;
 if p_claim is null or a.id is null or a.deleted_at is not null or a.mode<>'live' or a.test_data or a.answers->>'kind' is distinct from 'renewal' or x.status is distinct from 'active' or v.id is null or v.verified_at is null or v.contact_id is distinct from x.contact_id or v.email is distinct from lower(btrim(a.answers->>'email')) or substr(v.new_mobile,2) is distinct from public.icsh_membership_mobile_key(a.answers->>'mobile') then return null;end if;
 if (x.activation_kind='paid' and not exists(select 1 from public.icsh_membership_payments p where p.application_id=a.id and p.mode='live' and p.status='paid' and p.refunded_amount=0 and p.payment_intent_id=x.payment_intent_id)) or (x.activation_kind='free' and not public.icsh_free_membership_eligible(a.id)) then return null;end if;
 if v.mobile_status='pending' then
  update public.icsh_membership_mobile_verifications set mobile_status='writing',claim_id=p_claim where id=v.id returning * into v;
  return jsonb_build_object('claimed',true,'verification',to_jsonb(v)-'code_hash'-'proof_hash','start_date',x.start_date,'expiry_date',x.expiry_date);
 end if;
 return jsonb_build_object('claimed',false,'verification',to_jsonb(v)-'code_hash'-'proof_hash','start_date',x.start_date,'expiry_date',x.expiry_date);
end $$;
create function public.icsh_membership_mobile_finish(p_id uuid,p_claim uuid,p_confirmed boolean)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_claim is null or p_confirmed is null then return false;end if;
 update public.icsh_membership_mobile_verifications set mobile_status=case when p_confirmed then 'confirmed' else 'review_required' end,confirmed_at=case when p_confirmed then now() else confirmed_at end where id=p_id and claim_id=p_claim and mobile_status in ('writing','review_required');return found;
end $$;
create function public.icsh_membership_mobile_candidates()returns table(application_id uuid)language sql stable security invoker set search_path='' as $$
 select v.application_id from public.icsh_membership_mobile_verifications v join public.icsh_membership_activations x using(application_id) join public.icsh_membership_applications a on a.id=v.application_id
 where x.status='active' and a.deleted_at is null and v.mobile_status<>'confirmed' order by v.created_at limit 10;
$$;
-- Payment retries compare personal answers while retaining verified metadata on the original application.
do $$declare definition text;begin
 select pg_get_functiondef('public.icsh_membership_application_resume(jsonb,text,integer,text)'::regprocedure) into definition;
 if position('(a.answers-''mobile'') is distinct from (p_answers-''mobile'')' in definition)=0 then raise exception 'Unexpected retry definition';end if;
 definition:=replace(definition,'(a.answers-''mobile'') is distinct from (p_answers-''mobile'')','(a.answers-''mobile''-''mobileVerificationId'') is distinct from (p_answers-''mobile''-''mobileVerificationId'')');
 definition:=replace(definition,'-- Additional payment/receipt access only.', 'if a.answers->>''mobileVerificationId'' is null and p_answers->>''mobileVerificationId'' is not null then update public.icsh_membership_applications set answers=answers||jsonb_build_object(''mobileVerificationId'',p_answers->>''mobileVerificationId'') where id=a.id;end if; -- Additional payment/receipt access only.');
 execute definition;
end $$;
revoke all on function public.icsh_membership_mobile_start(uuid,text,text,text,text,text),public.icsh_membership_mobile_verify(uuid,text,text),public.icsh_membership_mobile_proof(uuid,text,text,text,uuid),public.icsh_membership_mobile_bind(),public.icsh_membership_mobile_claim(uuid,uuid),public.icsh_membership_mobile_finish(uuid,uuid,boolean),public.icsh_membership_mobile_candidates() from public,anon,authenticated;
grant execute on function public.icsh_membership_mobile_start(uuid,text,text,text,text,text),public.icsh_membership_mobile_verify(uuid,text,text),public.icsh_membership_mobile_proof(uuid,text,text,text,uuid),public.icsh_membership_mobile_bind(),public.icsh_membership_mobile_claim(uuid,uuid),public.icsh_membership_mobile_finish(uuid,uuid,boolean),public.icsh_membership_mobile_candidates() to service_role;
commit;
