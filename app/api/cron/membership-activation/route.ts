import {reconcileMemberIds} from '@/lib/member-ids/server';
import {authorisedActivationJob,reconcilePaidMemberships} from '@/lib/membership-activation/server';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};if(!authorisedActivationJob(request))return Response.json({error:'Unauthorised'},{status:401,headers});try{return Response.json({...await reconcilePaidMemberships(),memberIds:await reconcileMemberIds()},{headers});}catch{return Response.json({error:'Reconciliation unavailable'},{status:503,headers});}}
