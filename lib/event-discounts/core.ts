/**
 * The Early Bird calculation is shared by ordinary ticket bookings and Iftari.
 * All amounts are integer GBP pence. This module does not grant eligibility:
 * the caller must verify a paid membership using the existing Bigin lookup.
 */
export type TicketCategory='adult'|'child'|'donation';
export type DiscountBasis='fixed'|'percentage';
export type DiscountApplication='per_ticket'|'per_booking';
export type RedemptionBasis='booking'|'ticket';
export type DiscountScope='tickets'|'iftari';

export type DiscountConfiguration={
 id:string|null;
 scopeKind:DiscountScope; scopeId:string;
 code:string|null; name:string;
 basis:DiscountBasis; value:number; // pence for fixed; integer percentage (1-100) otherwise
 categories:'adult'|'child'|'all';
 application:DiscountApplication; redemptionBasis:RedemptionBasis;
 maximum:number; perCustomerMaximum:number|null;
 startsAt:string|null; expiresAt:string|null;
 paidMembersOnly:boolean; active:boolean; version:number;
};

export type TicketLine={category:TicketCategory;quantity:number;unitPence:number};
export type DiscountBreakdown={grossPence:number;eligiblePence:number;discountPence:number;payablePence:number;units:number;eligibleTickets:number};

export const emptyDiscount=(scopeKind:DiscountScope,scopeId:string):DiscountConfiguration=>({
 id:null,scopeKind,scopeId,code:null,name:'Early Bird Offer',
 basis:'fixed',value:0,categories:'all',application:'per_booking',redemptionBasis:'booking',
 maximum:0,perCustomerMaximum:null,startsAt:null,expiresAt:null,paidMembersOnly:false,active:false,version:0
});
export function normaliseCode(value:string):string{
 const code=value.trim().toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code))throw Error('Use 3–32 letters, numbers, hyphens or underscores for the discount code.');
 return code;
}
export function validDiscountSettings(s:DiscountConfiguration):void{
 if(s.active){
  if(!s.code)throw Error('Enter a code before activating the offer.');
  normaliseCode(s.code);
  if(!Number.isSafeInteger(s.value)||s.value<=0||(s.basis==='percentage'&&s.value>100))throw Error('Enter a valid discount value.');
  if(!Number.isSafeInteger(s.maximum)||s.maximum<1)throw Error('Set a maximum number of redemptions.');
 }
 if(!Number.isSafeInteger(s.maximum)||s.maximum<0||s.maximum>1000000)throw Error('Redemption limit is invalid.');
 if(s.perCustomerMaximum!==null&&(!Number.isSafeInteger(s.perCustomerMaximum)||s.perCustomerMaximum<1||s.perCustomerMaximum>s.maximum))throw Error('Customer limit must be between 1 and the overall limit.');
 if(s.startsAt&&(!Number.isFinite(Date.parse(s.startsAt))||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s.startsAt)))throw Error('Enter a valid UK start date/time.');
 if(s.expiresAt&&(!Number.isFinite(Date.parse(s.expiresAt))||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(s.expiresAt)))throw Error('Enter a valid UK expiry date/time.');
 if(s.startsAt&&s.expiresAt&&Date.parse(s.expiresAt)<=Date.parse(s.startsAt))throw Error('Expiry must follow the start date.');
}
export function calculateDiscount(config:DiscountConfiguration,lines:TicketLine[],paidMember:boolean,now=Date.now()):DiscountBreakdown{
 validDiscountSettings(config);
 if(!config.active||!config.code)throw Error('This discount code is inactive.');
 if(config.startsAt&&now<Date.parse(config.startsAt))throw Error('This offer is not open yet.');
 if(config.expiresAt&&now>=Date.parse(config.expiresAt))throw Error('This discount code has expired.');
 if(config.paidMembersOnly&&!paidMember)throw Error('This offer is for paid ICSH members only.');
 if(!lines.length||lines.some(l=>!['adult','child','donation'].includes(l.category)||!Number.isSafeInteger(l.quantity)||l.quantity<0||l.quantity>100||!Number.isSafeInteger(l.unitPence)||l.unitPence<0||l.unitPence>1_000_000))throw Error('Invalid ticket totals.');
 const grossPence=lines.reduce((sum,l)=>sum+l.quantity*l.unitPence,0);
 const eligible=lines.filter(l=>l.category!=='donation'&&(config.categories==='all'||l.category===config.categories)&&l.unitPence>0);
 const eligiblePence=eligible.reduce((sum,l)=>sum+l.quantity*l.unitPence,0);
 const eligibleTickets=eligible.reduce((sum,l)=>sum+l.quantity,0);
 if(!eligibleTickets||!eligiblePence)throw Error('This code does not apply to the selected ticket categories.');
 const portion=(base:number)=>config.basis==='fixed'?Math.min(base,config.value):Math.floor((base*config.value+50)/100);
 const discountPence=Math.min(eligiblePence,config.application==='per_ticket'
  ?eligible.reduce((sum,l)=>sum+l.quantity*portion(l.unitPence),0)
  :portion(eligiblePence));
 const payablePence=grossPence-discountPence;
 // Stripe Checkout's minimum payable amount in GBP is 30p. A fully-free
 // booking would require the site's separate free-ticket confirmation flow.
 if(payablePence>0&&payablePence<30)throw Error('The discounted total is below the secure-payment minimum.');
 if(payablePence===0)throw Error('This code would make the whole booking free. Contact ICSH to arrange a complimentary place.');
 return {grossPence,eligiblePence,discountPence,payablePence,
  units:config.redemptionBasis==='ticket'?eligibleTickets:1,eligibleTickets};
}
