import {sendRenewalTest,authorisedRenewalTest,runRenewalReminders} from '@/lib/renewal-reminders/server';
import {renewalStages,type RenewalStage} from '@/lib/renewal-reminders/core';
export const dynamic='force-dynamic';export const runtime='nodejs';export const maxDuration=30;
const headers={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex'};
export async function POST(request:Request){
 if(!await authorisedRenewalTest(request))return Response.json({error:'Not found'},{status:404,headers});
 let body;try{body=await request.json();}catch{return Response.json({error:'Invalid test'},{status:400,headers});}
 if(!body||Object.keys(body).length!==1||!renewalStages.includes(body.stage))return Response.json({error:'Invalid test'},{status:400,headers});
 try{return Response.json(await sendRenewalTest(body.stage as RenewalStage),{headers});}catch{return Response.json({error:'Test requires review'},{status:503,headers});}
}

export async function GET(request:Request){if(!await authorisedRenewalTest(request))return Response.json({error:'Not found'},{status:404,headers});try{return Response.json(await runRenewalReminders(true),{headers});}catch{return Response.json({error:'Reminder setup requires review'},{status:503,headers});}}
