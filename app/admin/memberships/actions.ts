'use server';
import {z} from 'zod';
import {organiserSession} from '@/lib/supabase/server';
import {createEventService} from '@/lib/event-forms/service.js';
import {revalidatePath} from 'next/cache';
export async function deleteMembershipEntries(value:unknown){
 const parsed=z.array(z.uuid()).min(1).max(100).safeParse(value);if(!parsed.success)return{ok:false,error:'Select up to 100 entries.'};
 const access=await organiserSession();if(access.status!=='organiser')return{ok:false,error:'Sign in with an approved ICSH account.'};
 const result=await createEventService().rpc('icsh_membership_entries_delete',{p_ids:[...new Set(parsed.data)],p_actor:access.user.id});
 if(result.error)return{ok:false,error:'Entries could not be deleted. Please retry.'};revalidatePath('/admin/memberships');return{ok:true,count:result.data as number};
}

export async function retryMembershipActivation(id:unknown){
 const parsed=z.uuid().safeParse(id);if(!parsed.success)return{ok:false,message:'Choose a saved application.'};
 const access=await organiserSession();if(access.status!=='organiser')return{ok:false,message:'Sign in with an approved ICSH account.'};
 try{const {activatePaidMembership}=await import('@/lib/membership-activation/server');const result=await activatePaidMembership(parsed.data);revalidatePath('/admin/memberships');return{ok:result==='active',message:result==='active'?'Membership is active and its dates have been verified in Bigin.':result==='review_required'?'Payment is confirmed. The matched contact or existing membership term needs organiser review.':'No eligible verified payment is available for activation.'};}catch{return{ok:false,message:'Payment remains recorded. Activation could not be completed; retry later and check the Bigin connection permissions.'};}
}
