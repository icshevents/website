export type Category = 'standard' | 'pensioner' | 'student';
export type MembershipQuote = {age:number; category:Category; label:string; fee:number; currency:'GBP'; months:12; startDate:string; expiryDate:string; declarationRequired:boolean; minor:boolean};
export const STUDENT_DECLARATION = 'I confirm that I am under 21 years of age and currently enrolled in full-time education. I understand that free ICSH membership is available only to applicants who meet both eligibility requirements. I confirm that the information I have provided is accurate and understand that ICSH may request reasonable evidence of my student status to verify my eligibility.';
export const MEMBERSHIP_RATES = [
  {id:'standard',name:'Standard Membership',price:'£20',period:'/ year',badge:'A year of connection',eligibility:'For adults aged 21–65, and anyone who does not qualify for a concession.',benefits:['Full 12-month ICSH membership','Access to ICSH community activities','Eligibility for applicable members-only events and benefits']},
  {id:'pensioner',name:'Pensioner Membership',price:'£15',period:'/ year',badge:'Concessionary Rate',eligibility:'For members aged 66 and above. Age 65 remains the standard rate.',benefits:['Full 12-month ICSH membership','Same membership benefits as standard members','Reduced annual membership fee']},
  {id:'student',name:'Student / Young Person',price:'FREE',period:'',badge:'Free Membership',eligibility:'For under-21s currently in full-time education, with an eligibility declaration.',benefits:['Full 12-month ICSH membership','Access to applicable ICSH community activities','Same general membership benefits, subject to existing eligibility rules']},
] as const;
export function londonDate(now = new Date()):string {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=(type:string)=>parts.find(p=>p.type===type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function parseDate(value:string):Date|null {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value ? date : null;
}
export function ageOn(dob:string, on:string):number {
  if(!parseDate(dob)||!parseDate(on)||dob>on||dob<'1900-01-01') throw new Error('Enter a valid date of birth, from 1900 through today.');
  const [y,m,d]=dob.split('-').map(Number);const [ty,tm,td]=on.split('-').map(Number);
  return ty-y-(tm<m||(tm===m&&td<d)?1:0);
}
export function anniversary(date:string):string {
  if(!parseDate(date)) throw new Error('Invalid membership date.');
  const [y,m,d]=date.split('-').map(Number);
  const lastDay=new Date(Date.UTC(y+1,m,0)).getUTCDate();
  return `${y+1}-${String(m).padStart(2,'0')}-${String(Math.min(d,lastDay)).padStart(2,'0')}`;
}
export function quoteMembership(dob:string, education:boolean, on=londonDate()):MembershipQuote {
  const age=ageOn(dob,on);const category:Category=age>=66?'pensioner':age<21&&education?'student':'standard';
  return {age,category,label:category==='student'?'Student Membership':category==='pensioner'?'Pensioner Membership':'Standard Membership',fee:category==='student'?0:category==='pensioner'?15:20,currency:'GBP',months:12,startDate:on,expiryDate:anniversary(on),declarationRequired:category==='student',minor:age<18};
}
export function dateLabel(value:string):string {return new Date(`${value}T12:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'});}
export function priceLabel(fee:number):string {return fee===0?'FREE':`£${fee}`;}
