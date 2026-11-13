import {reconcileMobileChanges} from '@/lib/membership-mobile/server';
import {reconcileMemberIds} from '@/lib/member-ids/server';
import {processFormEmails} from '@/lib/form-emails/server';
import {authorisedActivationJob,reconcilePaidMemberships,reconcileFreeMemberships} from '@/lib/membership-activation/server';
import {reconcileMembershipInvitations} from '@/lib/whatsapp-invitations/server';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};
 if(!authorisedActivationJob(request))return Response.json({error:'Unauthorised'},{status:401,headers});
 const emailJob=processFormEmails(10).catch(()=>({error:'Email processing pending'}));
 try{
  const paid=await reconcilePaidMemberships(),freeMemberships=await reconcileFreeMemberships(),memberIds=await reconcileMemberIds(),mobileChanges=await reconcileMobileChanges();
  const whatsappInvitations=await reconcileMembershipInvitations().catch(()=>({error:'Invitation review required'}));
  return Response.json({...paid,freeMemberships,memberIds,mobileChanges,emails:await emailJob,whatsappInvitations},{headers});
 }catch{await emailJob;return Response.json({error:'Reconciliation unavailable'},{status:503,headers});}
}
