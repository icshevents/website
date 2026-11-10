import {MEMBERSHIP_PRICING as prices} from './membership-pricing.ts';
export type Category='standard'|'pensioner'|'student'|'minor';
export type Education=''|'yes'|'no';
export type MembershipQuote={age:number;category:Category;label:string;fee:number;currency:'GBP';months:12;explanation:string;declarationRequired:boolean;minor:boolean};
export const STUDENT_DECLARATION='I confirm that I am in full-time education and eligible for free student membership (ages 17–21).';
export const MINOR_MEMBERSHIP_NOTICE='Children aged 16 and below are automatically dependants of a member and do not need to sign up or complete a form. This registration form is for applicants aged 17 and above.';
export function isStudentAge(age:number):boolean {return age>=prices.studentMinimumAge&&age<prices.studentMaximumAgeExclusive;}
export const ACCURACY_DECLARATION='I confirm that my answers are true, accurate and complete. Incorrect information may affect my eligibility.';
export const MEMBERSHIP_RATES=[
 {id:'standard',name:'Standard Membership',fee:prices.standardFee,badge:'A year of connection',eligibility:'For members who do not qualify for a concession.',benefits:['Access to ICSH community activities','Eligibility for applicable members-only events and benefits']},
 {id:'pensioner',name:'Pensioner Membership',fee:prices.pensionerFee,badge:'Senior Member Rate',eligibility:`For members aged ${prices.pensionerMinimumAge} and above.`,benefits:['Same membership benefits as standard members','Reduced annual membership fee']},
 {id:'student',name:'Student Membership',fee:prices.studentFee,badge:'Free Membership',eligibility:`For applicants aged ${prices.studentMinimumAge}–${prices.studentMaximumAgeExclusive-1} inclusive who are enrolled in full-time education.`,benefits:['Access to applicable ICSH community activities','Same general membership benefits, subject to existing eligibility rules']},
] as const;
export function londonDate(now=new Date()):string {
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const value=(type:string)=>parts.find(p=>p.type===type)!.value;
 return `${value('year')}-${value('month')}-${value('day')}`;
}
export function parseDate(value:string):Date|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const date=new Date(`${value}T12:00:00Z`);
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date:null;
}
export function britishToIso(value:string):string|null {
 const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());if(!match)return null;
 const iso=`${match[3]}-${match[2]}-${match[1]}`;return parseDate(iso)?iso:null;
}
export function isoToBritish(value:string):string {return parseDate(value)?value.split('-').reverse().join('/'):'';}
export function ageOn(dob:string,on:string):number {
 if(!parseDate(dob)||!parseDate(on)||dob>on||dob<'1900-01-01')throw new Error('Enter a valid date of birth from 1900 through today.');
 const [y,m,d]=dob.split('-').map(Number);const [ty,tm,td]=on.split('-').map(Number);
 return ty-y-(tm<m||(tm===m&&td<d)?1:0);
}
export function quoteMembership(dob:string,education:Education,on=londonDate()):MembershipQuote {
 const age=ageOn(dob,on);const category:Category=age<=prices.freeMinorMaximumAge?'minor':age>=prices.pensionerMinimumAge?'pensioner':isStudentAge(age)&&education==='yes'?'student':'standard';
 const explanation=category==='minor'?MINOR_MEMBERSHIP_NOTICE:category==='pensioner'?`You are aged ${prices.pensionerMinimumAge} or above and qualify for the pensioner rate.`:category==='student'?`You are aged ${prices.studentMinimumAge}–${prices.studentMaximumAgeExclusive-1} inclusive and in full-time education. Your eligibility declaration is required.`:isStudentAge(age)?'The standard rate applies if you are not in full-time education.':'The standard rate applies because you do not qualify for a concession.';
 return {age,category,label:category==='minor'?'Free Membership (16 and below)':category==='student'?'Student Membership':category==='pensioner'?'Pensioner Membership':'Standard Membership',fee:category==='minor'||category==='student'?0:category==='pensioner'?prices.pensionerFee:prices.standardFee,currency:prices.currency,months:prices.durationMonths,explanation,declarationRequired:category==='student',minor:age<18};
}
export function priceLabel(fee:number,decimals=true):string {return fee===0?'FREE':new Intl.NumberFormat('en-GB',{style:'currency',currency:prices.currency,minimumFractionDigits:decimals?2:0,maximumFractionDigits:decimals?2:0}).format(fee);}
