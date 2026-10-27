// Pure, injectable email adapter. Runtime callers must use server.ts.
export type EmailKind = 'membership_active' | 'membership_reminder' | 'donation' | 'rishta' | 'event' | 'stall';
export type Confirmation = {id:string; kind:EmailKind; recipient:string; reference:string; event_title:string; activation_kind?:'paid'|'free'; membership_number?:string; start_date?:string; expiry_date?:string; test?:boolean};
export type MailEnvironment = Record<string,string|undefined>;
const origins = ['https://cpaas.zoho.com','https://cpaas.zoho.eu','https://cpaas.zoho.in','https://cpaas.zoho.com.au','https://cpaas.zoho.jp','https://cpaas.zoho.com.cn'];
const email = (s:string) => s.length<=254 && !/[\s<>\u0000-\u001f]/.test(s) && /^[^@]+@[^@]+\.[^@]+$/.test(s);
export function emailConfiguration(env:MailEnvironment) {
  if(env.ZOHO_TRANSACTIONAL_EMAIL_ENABLED!=='true') return null;
  const origin=env.ZOHO_TRANSACTIONAL_API_ORIGIN||'',from=env.ZOHO_TRANSACTIONAL_FROM||'';
  // Zoho's copy control may include the HTTP Authorization header prefix.
  const token=(env.ZOHO_TRANSACTIONAL_SEND_KEY||'').trim().replace(/^Authorization:\s*/i,'').replace(/^Zoho-enczapikey\s+/i,'').trim();
  if(!origins.includes(origin))throw new Error('EMAIL_ORIGIN_INVALID');
  if(!email(from))throw new Error('EMAIL_SENDER_INVALID');
  if(!token)throw new Error('EMAIL_KEY_MISSING');
  if(token.length>4096||/[\s\u0000-\u001f]/.test(token))throw new Error('EMAIL_KEY_FORMAT_INVALID');
  return {origin,token,from};
}
const wording:Record<EmailKind,{subject:string;body:string}> = {
  membership_active:{subject:'Payment received – your membership is active',body:'Thank you. Your membership payment has been verified and your ICSH membership is now active. Please keep your application reference for any questions about your membership. We look forward to welcoming you at our activities and events.'},
  membership_reminder:{subject:'Complete your ICSH membership payment',body:'Your membership application is saved, but we have not yet verified a successful payment. Your membership will only activate after payment has been verified. Please return to your original website confirmation to finish payment, or submit the membership form again using the same details to resume your saved application. If you cannot access it, contact events@icsh.org.uk with the reference below so we can help you complete your application.'},
  donation:{subject:'Donation request received',body:'Thank you for choosing to support ICSH. We have saved your donation request. Please complete the secure payment process if you have not already done so. This email acknowledges your request and is not a payment receipt.'},
  rishta:{subject:'Your submission has been received',body:'Thank you for your submission to ICSH. We have received it for review. Please keep your reference for any follow-up. For your privacy, the information and any photograph you supplied are not included in this email.'},
  event:{subject:'Event registration received',body:'Thank you for submitting your event registration. We have saved your details. Please keep your reference and follow any payment or next-step instructions shown on your website confirmation. This acknowledgement does not confirm payment or guarantee a place where approval is required.'},
  stall:{subject:'Stall application received',body:'Thank you for your stall application. We have received it for review. Please keep your reference. Your application is subject to approval, and this acknowledgement does not confirm a stall or payment.'},
};
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function confirmationContent(value:Confirmation) {
  if(!Object.hasOwn(wording,value.kind)||!email(value.recipient)||/\.(invalid|test|example|localhost)$/i.test(value.recipient)||/^[^@]+@(?:[^@]+\.)?example\.(?:com|org|net)$/i.test(value.recipient)||!/^[A-Za-z0-9-]{1,100}$/.test(value.reference)||!/^[a-f0-9-]{36}$/i.test(value.id)) throw new Error('EMAIL_INPUT_INVALID');
  let membership:string[]=[];
  if(value.kind==='membership_active'){
    const validDate=(s:string|undefined)=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
    if(typeof value.membership_number!=='string'||value.membership_number.trim().length<1||value.membership_number.length>100||/[\u0000-\u001f\u007f]/.test(value.membership_number)||!validDate(value.start_date)||!validDate(value.expiry_date)||value.expiry_date!<value.start_date!)throw new Error('MEMBERSHIP_DETAILS_INVALID');
    const display=(s:string)=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T00:00:00Z'));
    membership=[`Membership number: ${value.membership_number}`,`Membership starts: ${display(value.start_date!)}`,`Membership expires: ${display(value.expiry_date!)}`];
  }
  const w=value.kind==='membership_active'&&value.activation_kind==='free'?{subject:'Your free membership is active',body:'Your free ICSH membership is now active. No payment is required. We look forward to welcoming you at our activities and events.'}:wording[value.kind];
  const title=['event','stall'].includes(value.kind)?value.event_title.replace(/[\u0000-\u001f]/g,' ').slice(0,200):'';
  const paragraphs=[...(value.test?['TEST EMAIL — fictional details for checking delivery and appearance only. This email does not activate a membership or record a payment.']:[]),'Assalamu alaikum,',w.body,...membership,...(title?[`Event: ${title}`]:[]),`Reference: ${value.reference}`,'If you have any questions, contact events@icsh.org.uk and quote your reference.','ICSH'];
  return {subject:`${value.test?'[TEST] ':''}ICSH – ${w.subject}`,textbody:paragraphs.join('\n\n'),htmlbody:`<!doctype html><html lang="en"><body style="margin:0;background:#F8F7F2;color:#263b32;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;max-width:600px;margin:24px auto;background:white;border-top:5px solid #AD925A"><tr><td style="padding:32px"><h1 style="font-size:24px;color:#4C6259">${escapeHtml(w.subject)}</h1>${paragraphs.map(p=>`<p style="line-height:1.6">${escapeHtml(p)}</p>`).join('')}</td></tr></table></body></html>`};
}
export type SendResult={status:'accepted'|'retry'|'failed'|'review_required';providerId?:string;code?:string};
function providerRejection(body:unknown){
  const codes=new Set<string>();
  const visit=(value:unknown,depth:number)=>{
    if(!value||typeof value!=='object'||depth>5)return;
    for(const [key,item] of Object.entries(value).slice(0,30)){
      if(['code','error_code'].includes(key)&&typeof item==='string'&&/^(TM|SM|SERR|AE|LE|GE|MTR|UE|SMI)_[0-9]{3,4}$/.test(item)&&codes.size<4)codes.add(item);
      if(typeof item==='object')visit(item,depth+1);
    }
  };
  visit(body,0);
  return codes.size?'ZOHO_'+[...codes].join('_'):'EMAIL_PROVIDER_REJECTED';
}
export async function sendConfirmation(value:Confirmation,env:MailEnvironment,fetchImpl:typeof fetch=fetch):Promise<SendResult> {
  const config=emailConfiguration(env);if(!config)throw new Error('EMAIL_DISABLED');
  const content=confirmationContent(value);
  try {
    const response=await fetchImpl(config.origin+'/v1.1/email',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{Authorization:'Zoho-enczapikey '+config.token,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({from:{address:config.from,name:'ICSH'},to:[{email_address:{address:value.recipient}}],reply_to:[{address:config.from,name:'ICSH'}],...content,track_clicks:false,track_opens:false,client_reference:value.id})});
    if(response.status===429)return {status:'retry',code:'EMAIL_RATE_LIMITED'};
    if(response.status>=400&&response.status<500){
      let code='EMAIL_PROVIDER_REJECTED';try{code=providerRejection(await response.json());}catch{}
      return {status:'failed',code};
    }
    // A network/server failure may happen after acceptance. Never blindly resend.
    if(!response.ok)return {status:'review_required',code:'EMAIL_OUTCOME_UNKNOWN'};
    const body=await response.json();
    if(body.message!=='OK'||!Array.isArray(body.data)||body.data.length!==1||body.data[0]?.code!=='EM_104'||typeof body.request_id!=='string'||!/^[A-Za-z0-9_.-]{1,200}$/.test(body.request_id))return {status:'review_required',code:'EMAIL_RESPONSE_UNCERTAIN'};
    return {status:'accepted',providerId:body.request_id};
  }catch{return {status:'review_required',code:'EMAIL_OUTCOME_UNKNOWN'};}
}
