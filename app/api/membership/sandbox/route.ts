import {sandboxConfiguration,sandboxHeaders,sandboxCookie,newSandboxSession,sandboxRequestSession,sandboxCsrf,sandboxQuote,StripeSandboxClient} from '@/lib/stripe-sandbox';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200,extra={})=>Response.json(body,{status,headers:{...sandboxHeaders,...extra}});
export async function GET(request:Request){
 const config=sandboxConfiguration();if(!config)return json({error:'Sandbox unavailable.'},404);
 const session=sandboxRequestSession(request,config.key)||newSandboxSession(config.key);
 return json({sandbox:true,csrf:sandboxCsrf(session,config.key) },200,{'Set-Cookie':`${sandboxCookie}=${session}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600`});
}
export async function POST(request:Request){
 const config=sandboxConfiguration();if(!config)return json({error:'Sandbox unavailable.'},404);
 if(request.headers.get('origin')!==new URL(request.url).origin||!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Submit from the sandbox form.'},403);
 const session=sandboxRequestSession(request,config.key);
 if(!session||request.headers.get('x-csrf-token')!==sandboxCsrf(session,config.key))return json({error:'Reload the sandbox form and try again.'},403);
 const text=await request.text();if(text.length>4096)return json({error:'Request too large.'},413);
 let input;try{input=sandboxQuote(JSON.parse(text));}catch{return json({error:'Check the fictional details, date of birth and declarations. Applicants must be at least 17.'},400);}
 if(input.amount===0)return json({sandbox:true,paymentRequired:false,category:input.quote.category,amount:0,message:'No payment required. This sandbox check does not activate membership or save an application.'});
 try{return json({sandbox:true,paymentRequired:true,...await new StripeSandboxClient(config.key).create(input,session,config.origin)});}catch{return json({error:'Stripe sandbox checkout could not be confirmed. Retry this same form; do not enter real payment details.'},502);}
}
