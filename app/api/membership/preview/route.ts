import {londonDate} from '@/lib/membership';
import {validateApplicant,runPreview,sampleRepository, type Simulation} from '@/lib/membership-preview';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
export async function POST(request:Request) {
 // This route can only validate and simulate. It cannot create memberships, accept money or call Zoho.
 const origin=request.headers.get('origin');
 const host=request.headers.get('host')||new URL(request.url).host;
 let sameOrigin=false;
 try {const url=new URL(origin||'');sameOrigin=url.host===host&&(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)));}catch{}
 if(!sameOrigin)return Response.json({error:'Open the membership preview on this website to continue.'},{status:403,headers});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'Send the preview form as JSON.'},{status:415,headers});
 try {
  const reader=request.body?.getReader();if(!reader)throw new Error('Missing body');let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();return Response.json({error:'The form is too large.'},{status:413,headers})}chunks.push(value)}
  const text=Buffer.concat(chunks).toString('utf8');const input=JSON.parse(text);const now=new Date();const on=londonDate(now);
  const {applicant,quote,errors}=validateApplicant(input,on);
  if(Object.keys(errors).length||!applicant||!quote)return Response.json({errors},{status:422,headers});
  const simulation:Simulation=input.simulation==='success'?'success':input.simulation==='failure'?'failure':'not_started';
  const outcome=await runPreview(applicant,quote,simulation,sampleRepository(on),now);
  return Response.json({preview:true,persisted:false,charged:false,crmConnected:false,outcome},{headers});
 }catch{return Response.json({error:'We could not read the preview form. Please check your details and try again.'},{status:400,headers})}
}
