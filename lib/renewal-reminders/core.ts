import {londonDate,parseDate} from '../membership.ts';
import type {BiginContact} from '../zoho/client.ts';
export const renewalStages=['before30','before7','expired','after7'] as const;
export type RenewalStage=typeof renewalStages[number];
export const stageDays:Record<RenewalStage,number>={before30:30,before7:7,expired:0,after7:-7};
const validEmail=(v:string)=>v.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)&&!/\.(invalid|test|example|localhost)$/i.test(v)&&!/@(?:[^@]+\.)?example\.(com|org|net)$/i.test(v);
export function renewalStage(contact:BiginContact,on=londonDate()):RenewalStage|null{
 const {membershipDate:start,membershipExpiry:expiry}=contact;
 if(!validEmail(contact.email)||!start||!expiry||!parseDate(on)||!parseDate(start)||!parseDate(expiry)||start>=expiry||start>on||!['Active','Inactive'].includes(contact.membershipStatus||''))return null;
 if(contact.paymentStatus!=='Completed'&&!(contact.membershipType==='Student'&&contact.paymentStatus==='Not required'))return null;
 const days=Math.round((Date.parse(expiry+'T12:00:00Z')-Date.parse(on+'T12:00:00Z'))/86400000);
 if(days>0&&contact.membershipStatus!=='Active')return null;
 return renewalStages.find(s=>stageDays[s]===days)||null;
}
export function sameRenewalTerm(a:BiginContact,b:BiginContact,stage:RenewalStage,on:string){return a.id===b.id&&a.email===b.email&&a.membershipDate===b.membershipDate&&a.membershipExpiry===b.membershipExpiry&&a.memberId===b.memberId&&renewalStage(b,on)===stage;}
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function renewalContent(contact:BiginContact,stage:RenewalStage,test=false){
 if(!renewalStages.includes(stage)||!validEmail(contact.email)||!contact.membershipExpiry||!parseDate(contact.membershipExpiry))throw new Error('RENEWAL_CONTENT_INVALID');
 const expiry=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(contact.membershipExpiry+'T12:00:00Z'));
 const titles:Record<RenewalStage,string>={before30:'Your membership expires in 30 days',before7:'Your membership expires in 7 days',expired:'Your ICSH membership has expired',after7:'A final reminder to renew your membership'};
 const copy:Record<RenewalStage,string>={before30:'Your ICSH membership is due to expire soon. You can now renew online for another 12 months.',before7:'There is one week left on your current ICSH membership. Renew before it expires to keep your membership going.',expired:'Your current ICSH membership term has ended. You can renew online whenever you are ready.',after7:'Our records show that your ICSH membership expired a week ago and renewal has not yet been confirmed. This is the final reminder for this membership term.'};
 const early=stage==='before30'||stage==='before7';
 const details=contact.memberId?`Membership number: ${contact.memberId}\nMembership expiry: ${expiry}`:`Membership expiry: ${expiry}`;
 const paragraphs=[...(test?['TEST EMAIL — fictional member details for checking this reminder only. No membership or payment has been changed.']:[]),'Hello,',copy[stage],details,early?'If you renew before expiry, your new 12 months will be added after your current expiry date, so you keep all your remaining days.':'Your renewed membership will run for 12 months from its confirmed start date.',contact.membershipType==='Student'?'Renewal includes a check of your current eligibility. If you remain eligible for free student membership, no payment is required.':'The renewal form will show your current membership category and any applicable fee before you continue.','Renew your membership: https://icsh.org.uk/membership?category=renewal#join','For paid memberships, renewal is confirmed after successful payment verification. Eligible free memberships are confirmed after verification, without payment.','If you need help, reply to events@icsh.org.uk.','ICSH'];
 const body=paragraphs.filter(p=>p!=='Hello,'&&!p.startsWith('Renew your membership:')&&p!=='ICSH');
 const htmlbody=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#E7E9E2;color:#263B32;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#F8F7F2;border-top:5px solid #AD925A"><tr><td style="padding:24px 28px;border-bottom:1px solid #DDD7C7"><img alt="ICSH" src="https://icsh.org.uk/_next/image?url=%2Fassets%2Ficsh-logo.webp&amp;w=256&amp;q=75" width="64" style="display:block;width:64px;height:auto"><p style="font-size:11px;color:#4C6259;letter-spacing:1px">ISLAMIC AND CULTURAL SOCIETY OF HARROW</p></td></tr><tr><td style="padding:28px"><p style="font-size:11px;letter-spacing:2px;color:#4C6259">MEMBERSHIP RENEWAL</p><h1 style="font:36px/1.15 Georgia,serif;color:#4C6259;margin:16px 0 24px">${escape(titles[stage])}</h1><p style="font-size:16px;line-height:1.7">Hello,</p>${body.map(p=>`<p style="font-size:15px;line-height:1.75;white-space:pre-line">${escape(p)}</p>`).join('')}<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" bgcolor="#4C6259"><a href="https://icsh.org.uk/membership?category=renewal#join" style="display:block;padding:18px 12px;color:#fff;font-size:15px;font-weight:bold;text-decoration:none">Renew membership &rarr;</a></td></tr></table></td></tr><tr><td style="padding:24px 28px;border-top:1px solid #DDD7C7;color:#4C6259;font-size:12px;line-height:1.8">This is a notice about your existing ICSH membership.<br>Islamic and Cultural Society of Harrow &middot; Registered charity 290016<br><a href="mailto:events@icsh.org.uk" style="color:#4C6259">events@icsh.org.uk</a></td></tr></table></td></tr></table></body></html>`;
 return{subject:`${test?'[TEST] ':''}ICSH – ${titles[stage]}`,textbody:paragraphs.join('\n\n'),htmlbody};
}
export type RenewalState={permission:boolean;held:boolean};
export type NoticeOutcome={status:'accepted'|'retry'|'failed'|'review_required'|'cancelled';providerId?:string;code?:string};
export type RenewalDependencies={
 read:(id:string)=>Promise<BiginContact>;
 unique:(email:string,id:string)=>Promise<boolean>;
 state:(c:BiginContact)=>Promise<RenewalState>;
 claim:(c:BiginContact,s:RenewalStage)=>Promise<{id:string;token:string}|null>;
 finish:(id:string,token:string,o:NoticeOutcome)=>Promise<void>;
 send:(id:string,c:BiginContact,s:RenewalStage)=>Promise<NoticeOutcome>;
};
/** Every message rechecks live CRM and website state. A wait/queued entry is never proof of eligibility. */
export async function processRenewalNotice(candidate:BiginContact,stage:RenewalStage,deps:RenewalDependencies,on=londonDate()){
 if(renewalStage(candidate,on)!==stage)return'skipped';
 if(!await deps.unique(candidate.email,candidate.id))return'skipped';
 let current=await deps.read(candidate.id),state=await deps.state(current);
 if(!sameRenewalTerm(candidate,current,stage,on)||state.held||!state.permission)return'skipped';
 const claim=await deps.claim(current,stage);if(!claim)return'skipped';
 let outcome:NoticeOutcome;
 try{
  current=await deps.read(candidate.id);state=await deps.state(current);
  if(!sameRenewalTerm(candidate,current,stage,on)||state.held||!state.permission||!await deps.unique(current.email,current.id))outcome={status:'cancelled',code:'RENEWAL_STATE_CHANGED'};
  else outcome=await deps.send(claim.id,current,stage);
 }catch{outcome={status:'review_required',code:'RENEWAL_OUTCOME_REQUIRES_REVIEW'};}
 await deps.finish(claim.id,claim.token,outcome);return outcome.status;
}
