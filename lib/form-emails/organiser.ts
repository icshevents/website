import {z} from 'zod';

export const organiserAddress='events@icsh.org.uk';
const money=z.number().int().min(0).max(12000000);
const line=z.object({category:z.string().min(1).max(200),quantity:z.number().int().min(1).max(10000),unitAmount:money});
export const organiserNoticeSchema=z.object({
  type:z.enum(['membership','event','donation','rishta','stall','participation','custom']),
  stage:z.enum(['submitted','confirmed']),reference:z.string().min(1).max(100),
  title:z.string().max(240),status:z.string().max(100),
  details:z.record(z.string().max(240),z.union([z.string().max(5000),z.number(),z.boolean(),z.null()])),
  tickets:z.array(line).max(100).default([]),total:money.nullable().default(null),
  donation:money.default(0),discount:money.default(0),
}).superRefine((v,c)=>{
  if(v.tickets.length&&v.total!==null&&v.tickets.reduce((n,l)=>n+l.quantity*l.unitAmount,0)+v.donation-v.discount!==v.total)
    c.addIssue({code:'custom',message:'Ticket breakdown does not match booking total.'});
});
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const gbp=(n:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n/100);
export function organiserNoticeContent(input:unknown){
  const v=organiserNoticeSchema.parse(input);
  const heading=`${v.type==='rishta'?'Rishta registration':v.type==='membership'?'Membership':v.type==='donation'?'Donation':'Event '+(v.type==='event'?'booking':'registration')} ${v.stage==='confirmed'?'confirmed':'received'}`;
  const details=Object.entries(v.details).filter(([,value])=>value!==null&&value!=='').map(([key,value])=>`${key}: ${value}`);
  const paragraphs=['Hello ICSH team,',heading,`Form / event: ${v.title}`,`Status: ${v.status}`,
    ...(v.stage==='submitted'?['This is a form submission notification. It does not confirm payment or membership activation.']:[]),...details,
    ...(v.tickets.length?[`Total tickets: ${v.tickets.reduce((n,l)=>n+l.quantity,0)}`,...v.tickets.map(l=>`${l.category}: ${l.quantity} × ${gbp(l.unitAmount)} = ${gbp(l.quantity*l.unitAmount)}`)]:[]),
    ...(v.donation?[`Additional donation: ${gbp(v.donation)}`]:[]),...(v.discount?[`Discount: -${gbp(v.discount)}`]:[]),
    ...(v.total!==null?[`${v.stage==='confirmed'?'Confirmed total':'Submitted value'}: ${gbp(v.total)}`]:[]),
    'View the full entry in the Organiser Workspace: https://icsh.org.uk/admin','ICSH'];
  // Form titles are untrusted. Keep headers on one line and HTML escaped.
  return {subject:`ICSH | ${heading}${v.title?` | ${v.title}`:""}`.replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,250),textbody:paragraphs.join('\n\n'),
    htmlbody:`<!doctype html><html lang="en"><body style="margin:0;background:#F8F7F2;color:#173d30;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;max-width:640px;margin:24px auto;background:white;border-top:5px solid #AD925A"><tr><td style="padding:28px"><h1 style="font-size:24px">${escape(heading)}</h1>${paragraphs.map(p=>`<p style="line-height:1.6;white-space:pre-line">${escape(p)}</p>`).join('')}</td></tr></table></body></html>`};
}
