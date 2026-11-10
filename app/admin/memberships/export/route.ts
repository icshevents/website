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
  const [payments,activations,memberIds]=await Promise.all([membershipPaymentsForOrganiser(ids),membershipActivationsForOrganiser(ids),memberIdsForOrganiser(applications.flatMap(a=>a.biginRecordId?[a.biginRecordId]:[]))]);
  return applications.map(application=>({application,payment:payments.get(application.id),activation:activations.get(application.id),memberId:application.biginRecordId?memberIds.get(application.biginRecordId):undefined}));
 }
});}
