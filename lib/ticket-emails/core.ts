import {z} from 'zod';
const amount=z.number().int().min(0).max(12000000);
export const paidTicketEmailSchema=z.object({id:z.uuid(),recipient:z.email().max(254),reference:z.string().regex(/^[A-Za-z0-9-]{1,100}$/),name:z.string().min(1).max(120),title:z.string().min(1).max(140),venue:z.string().min(1).max(240),startsAt:z.iso.datetime({offset:true}),endsAt:z.iso.datetime({offset:true}),total:amount.min(30),attendees:z.array(z.object({ticket:z.string().max(40),unitAmount:amount})).min(1).max(12)}).superRefine((v,c)=>{
 if(v.attendees.reduce((sum,a)=>sum+a.unitAmount,0)!==v.total)c.addIssue({code:'custom',message:'Payment total does not match tickets.'});
 if(Date.parse(v.endsAt)<=Date.parse(v.startsAt))c.addIssue({code:'custom',message:'Invalid event times.'});
 if(/\.(invalid|test|example|localhost)$/i.test(v.recipient)||/^[^@]+@(?:[^@]+\.)?example\.(com|org|net)$/i.test(v.recipient))c.addIssue({code:'custom',message:'Test recipients are excluded.'});
});
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function paidTicketEmailContent(input:unknown){
 const v=paidTicketEmailSchema.parse(input),money=(n:number)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n/100);
 const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeZone:'Europe/London'}).format(new Date(v.startsAt));
 const time=(s:string)=>new Intl.DateTimeFormat('en-GB',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Europe/London'}).format(new Date(s));
 const grouped=new Map<string,{label:string;quantity:number;unitAmount:number}>();
 for(const a of v.attendees){const label=a.ticket==='child'?'Child under 12':'Adult (12+)',key=label+':'+a.unitAmount;const row=grouped.get(key)||{label,quantity:0,unitAmount:a.unitAmount};row.quantity++;grouped.set(key,row);}
 const paragraphs=[`Hello ${v.name},`,`Thank you for booking ${v.title}. Your payment has been received and your places are confirmed.`,`Booking reference: ${v.reference}`,`Event: ${v.title}`,`Date: ${date}`,`Time: ${time(v.startsAt)}–${time(v.endsAt)} (UK time)`,`Venue: ${v.venue}`,`Tickets: ${v.attendees.length}`,...[...grouped.values()].map(r=>`${r.quantity} × ${r.label} at ${money(r.unitAmount)}: ${money(r.quantity*r.unitAmount)}`),`Total paid: ${money(v.total)}`,'Feel free to wear festive accessories.','Please keep this email and quote your booking reference if you contact us.','For any questions or changes to your booking, email events@icsh.org.uk.','We look forward to seeing you.','ICSH'];
 return {subject:'ICSH – Winter lunch booking confirmed',textbody:paragraphs.join('\n\n'),htmlbody:`<!doctype html><html lang="en"><body style="margin:0;background:#F8F7F2;color:#263b32;font-family:Arial,sans-serif"><table role="presentation" style="width:100%;max-width:600px;margin:24px auto;background:white;border-top:5px solid #AD925A"><tr><td style="padding:32px"><h1 style="font-size:24px;color:#4C6259">Your winter lunch booking is confirmed</h1>${paragraphs.map(p=>`<p style="line-height:1.6">${escape(p)}</p>`).join('')}</td></tr></table></body></html>`};
}
