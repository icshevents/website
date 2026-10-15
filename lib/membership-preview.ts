import {quoteMembership, anniversary, type MembershipQuote} from './membership.ts';
export type Applicant={firstName:string;lastName:string;dob:string;email:string;mobile:string;kind:'new'|'renewal';education:boolean;declaration:boolean};
export type FieldErrors=Partial<Record<keyof Applicant|'form',string>>;
export function validateApplicant(value:unknown,on:string):{applicant?:Applicant;quote?:MembershipQuote;errors:FieldErrors} {
 const errors:FieldErrors={};if(!value||typeof value!=='object'||Array.isArray(value))return {errors:{form:'Enter your sample details to continue.'}};
 const input=value as Record<string,unknown>;
 const text=(key:string)=>typeof input[key]==='string'?(input[key] as string).trim():'';
 const applicant:Applicant={firstName:text('firstName'),lastName:text('lastName'),dob:text('dob'),email:text('email').toLowerCase(),mobile:text('mobile'),kind:input.kind==='renewal'?'renewal':'new',education:input.education===true,declaration:input.declaration===true};
 if(input.kind!=='new'&&input.kind!=='renewal')errors.kind='Choose joining or renewal.';
 for(const key of ['firstName','lastName'] as const)if(!applicant[key]||applicant[key].length>80||/[<>\u0000-\u001f]/.test(applicant[key]))errors[key]='Enter a name between 1 and 80 characters.';
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(applicant.email)||applicant.email.length>254)errors.email='Enter a valid email address.';
 if(!/^[+\d() .-]+$/.test(applicant.mobile)||applicant.mobile.replace(/\D/g,'').length<7||applicant.mobile.replace(/\D/g,'').length>15)errors.mobile='Enter a mobile number with 7–15 digits, including country code if needed.';
 let quote:MembershipQuote|undefined;
 try {quote=quoteMembership(applicant.dob,applicant.education,on);if(quote.declarationRequired&&!applicant.declaration)errors.declaration='Please confirm the full-time education declaration to preview free membership.';}catch(error){errors.dob=(error as Error).message;}
 return {applicant,quote,errors};
}
export type PreviewRecord={id:string;email:string;category:string;fee:number;startDate:string;expiryDate:string;studentDeclaration:boolean;studentDeclarationAt:string|null;paymentStatus:'paid'|'not_required';registeredAt:string};
export interface PreviewRepository {findByEmail(email:string):Promise<PreviewRecord[]>;save(record:PreviewRecord):Promise<void>}
export type Simulation='success'|'failure'|'not_started';
export type PreviewOutcome={status:'complete'|'payment_failed'|'payment_pending'|'review_required'|'under_18';message:string;quote:MembershipQuote;crmAction:'create'|'update'|'none';paymentStatus:'paid'|'not_required'|'failed'|'pending';declarationAt:string|null;existingExpiry?:string};
// Deliberately works with an injected test repository. No production CRM or payment transport exists here.
export async function runPreview(applicant:Applicant,quote:MembershipQuote,simulation:Simulation,repository:PreviewRepository,now:Date):Promise<PreviewOutcome> {
 const result:PreviewOutcome={status:'review_required',message:'',quote,crmAction:'none',paymentStatus:quote.fee===0?'not_required':'pending',declarationAt:quote.declarationRequired&&applicant.declaration?now.toISOString():null};
 if(quote.minor)return {...result,status:'under_18',message:'Under-18 registration is not enabled. ICSH must approve its parent or guardian process before registration for minors can launch.'};
 const existing=await repository.findByEmail(applicant.email);
 if(existing.length>1)return {...result,message:'The sample lookup found more than one record. Committee review is required; no record would be changed.'};
 if(applicant.kind==='new'&&existing.length)return {...result,message:'A sample membership already exists for this email. Select renewal to avoid a duplicate record.',existingExpiry:existing[0].expiryDate};
 if(applicant.kind==='renewal'&&!existing.length)return {...result,message:'No sample membership was found. A real renewal would require verified access to your existing membership before it could proceed.'};
 if(applicant.kind==='renewal'&&existing[0].expiryDate>quote.startDate)return {...result,message:'This is an early renewal. The existing expiry is preserved. ICSH must approve the date calculation before an early renewal can proceed.',existingExpiry:existing[0].expiryDate};
 if(quote.fee>0&&simulation!=='success')return {...result,status:simulation==='failure'?'payment_failed':'payment_pending',paymentStatus:simulation==='failure'?'failed':'pending',message:simulation==='failure'?'The example payment failed. Membership would stay inactive and the existing record would remain unchanged.':'A paid membership would wait for a verified payment confirmation before activation.'};
 const crmAction=existing.length?'update':'create';
 await repository.save({id:existing[0]?.id||'preview-only-member',email:applicant.email,category:quote.category,fee:quote.fee,startDate:quote.startDate,expiryDate:quote.expiryDate,studentDeclaration:quote.declarationRequired&&applicant.declaration,studentDeclarationAt:result.declarationAt,paymentStatus:quote.fee===0?'not_required':'paid',registeredAt:now.toISOString()});
 return {...result,status:'complete',crmAction,paymentStatus:quote.fee===0?'not_required':'paid',message:quote.fee===0?'Free membership would skip payment after eligibility and declaration checks.':'Paid membership would activate only after verified payment confirmation.'};
}
export function sampleRepository(on:string):PreviewRepository {
 const make=(id:string,email:string,expiryDate:string):PreviewRecord=>({id,email,expiryDate,category:'standard',fee:20,startDate:'2025-01-01',studentDeclaration:false,studentDeclarationAt:null,paymentStatus:'paid',registeredAt:'2025-01-01T12:00:00Z'});
 const records=[make('sample-early','early@example.test',anniversary(on)),make('sample-expired','renewal@example.test','2025-01-01'),make('duplicate-a','duplicate@example.test',on),make('duplicate-b','duplicate@example.test',on)];
 return {async findByEmail(email){return records.filter(r=>r.email===email)},async save(record){const index=records.findIndex(r=>r.id===record.id);if(index<0)records.push(record);else records[index]=record;}};
}
