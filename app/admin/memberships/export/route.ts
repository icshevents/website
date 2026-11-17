import {createEventService} from '@/lib/event-forms/service.js';
import {organiserSession} from '@/lib/supabase/server';
import {membershipExportPage} from '@/lib/membership-applications/store';
import {handleMembershipExport} from '@/lib/membership-applications/export';
import {membershipPaymentsForOrganiser} from '@/lib/membership-payments/server';
import {membershipActivationsForOrganiser} from '@/lib/membership-activation/server';
import {memberIdsForOrganiser} from '@/lib/member-ids/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleMembershipExport(request,{
 session:organiserSession,
 load:async(cutoff,cursor)=>{
  const applications=await membershipExportPage(cutoff,cursor);
  if(!applications.length)return [];
  const ids=applications.map(a=>a.id);
  const managed=await createEventService().from('icsh_entry_management').select('entry_id,status,deleted_at').eq('kind','membership').in('entry_id',ids);if(managed.error)throw Error('Entry statuses unavailable');
  const [payments,activations,memberIds]=await Promise.all([membershipPaymentsForOrganiser(ids),membershipActivationsForOrganiser(ids),memberIdsForOrganiser(applications.flatMap(a=>a.biginRecordId?[a.biginRecordId]:[]))]);
  return applications.map(application=>({deleted:Boolean(managed.data.find(s=>s.entry_id===application.id)?.deleted_at),entryStatus:managed.data.find(s=>s.entry_id===application.id)?.status,application,payment:payments.get(application.id),activation:activations.get(application.id),memberId:application.biginRecordId?memberIds.get(application.biginRecordId):undefined}));
 }
});}
