import {membershipActivationClient} from '@/lib/zoho/server';
import {handleInvitationReadiness} from '@/lib/whatsapp-invitations/readiness';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
 return handleInvitationReadiness(request,process.env,membershipActivationClient.inspectBiginInvitationFields);
}
