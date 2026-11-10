import type {MembershipApplication} from './model.ts';

export type ExportEntry={application:MembershipApplication;memberId?:string;payment?:{status:string;paid_at:string|null};activation?:{status:string;start_date:string;expiry_date:string}};
export type ExportCursor={createdAt:string;id:string};
export type ExportDependencies={session:()=>Promise<{status:string}>;load:(cutoff:string,cursor:ExportCursor|null)=>Promise<ExportEntry[]>;now?:()=>Date};
const headers={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','Vary':'Cookie'};
const columns=['Application reference','Received (UK time)','Application type','First name','Last name','Email','Mobile','Date of birth','Membership category','Fee (GBP)','Payment status','Verified payment (UK time)','Activation status','Membership start','Membership expiry','Member number','Bigin delivery status','Bigin contact ID','Full-time education','Student confirmation','Terms accepted','Accuracy confirmed','Membership communications notice','WhatsApp invitation acknowledged','Mode'];
function cell(value:unknown){const s=String(value??'');return '"'+(/^[\s]*[=+@-]/.test(s)||/^(?:0\d+|\d{16,})$/.test(s)?"'"+s:s).replaceAll('"','""')+'"';}
function ukTime(value:string|null|undefined){return value?new Intl.DateTimeFormat('en-GB',{dateStyle:'short',timeStyle:'medium',timeZone:'Europe/London'}).format(new Date(value)):'';}
export function membershipExportRow({application:a,payment,activation,memberId}:ExportEntry){
 const categories:Record<string,string>={standard:'Standard',pensioner:'Senior Member Rate',student:'Student'};
 const paymentLabels:Record<string,string>={pending:'Awaiting payment',paid:'Payment confirmed',failed:'Payment failed',expired:'Checkout expired',refunded:'Refunded - review required',partially_refunded:'Partially refunded - review required',disputed:'Disputed - review required'};
 return [a.reference,ukTime(a.createdAt),a.answers.kind==='renewal'?'Renewal':'New application',a.answers.firstName,a.answers.lastName,a.answers.email,a.answers.mobile,a.answers.dob,categories[a.category]||a.category,(a.feePence/100).toFixed(2),a.paymentStatus==='not_required'?'No payment required':payment?paymentLabels[payment.status]||'Review required':'Awaiting payment',ukTime(payment?.paid_at),activation?.status||'pending',activation?.status==='active'?activation.start_date:'',activation?.status==='active'?activation.expiry_date:'',memberId||'',a.biginSyncStatus,a.biginRecordId||'',a.answers.education==='yes'?'Yes':a.answers.education==='no'?'No':'Not stated',a.answers.studentDeclaration?'Confirmed':'Not confirmed / not required',a.answers.terms?'Yes':'No',a.answers.accuracy?'Yes':'No',a.answers.communicationsNotice||'',a.answers.whatsappInvitation===true?'Yes':a.answers.whatsappInvitation===false?'No':'Not recorded',a.mode==='live'?'LIVE':'HISTORICAL TEST'].map(cell).join(',');
}
export async function handleMembershipExport(request:Request,deps:ExportDependencies){
 const fail=(error:string,status:number)=>Response.json({error},{status,headers});
 if(request.method!=='GET')return fail('Use the organiser export button.',405);
 if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin))return fail('Open this export from the ICSH organiser workspace.',403);
 try{
  const session=await deps.session();
  if(session.status!=='organiser')return fail('Sign in with an approved ICSH organiser account.',session.status==='signed-out'?401:403);
  const cutoff=(deps.now?.()||new Date()).toISOString();
  const lines=[columns.map(cell).join(',')];let cursor:ExportCursor|null=null;let previousCursorKey='';
  for(;;){
   const rows=await deps.load(cutoff,cursor);
   for(const entry of rows)lines.push(membershipExportRow(entry));
   if(rows.length<100)break;
   const last=rows.at(-1)!.application;
   const cursorKey=last.createdAt+'|'+last.id;
   if(cursorKey===previousCursorKey)throw Error('Export did not advance');
   previousCursorKey=cursorKey;
   cursor={createdAt:last.createdAt,id:last.id};
  }
  return new Response('\uFEFF'+lines.join('\r\n')+'\r\n',{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="icsh-membership-applications-${cutoff.slice(0,10)}.csv"`}});
 }catch{return fail('The export could not be completed. No partial file was downloaded. Please retry.',503);}
}
