import 'server-only';
import {createHmac} from 'node:crypto';
import {AppError} from '../event-forms/domain.js';
import {calculateDiscount,normaliseCode,type DiscountConfiguration} from './core.ts';
import type {BookingPrice,BookingDiagnostics} from '../event-forms/booking-membership.ts';

type DB={from:(name:string)=>any};
export type VerifiedTicketPromotion={
 code:string;name:string;grossPence:number;discountPence:number;netPence:number;units:number;
 discountId:string;scopeKind:'tickets';scopeId:string;customerHash:string;paidMemberVerified:boolean;
};
function config(row:Record<string,any>):DiscountConfiguration{
 return {id:row.id,scopeKind:'tickets',scopeId:row.scope_id,code:row.code,name:row.name,
 basis:row.basis,value:row.value,categories:row.categories,application:row.application,
 redemptionBasis:row.redemption_basis,maximum:row.maximum,
 perCustomerMaximum:row.per_customer_maximum,startsAt:row.starts_at,expiresAt:row.expires_at,
 paidMembersOnly:row.paid_members_only,active:row.active,version:row.version};
}
export const publicTicketPromotion=(p:VerifiedTicketPromotion)=>({
 code:p.code,name:p.name,grossPence:p.grossPence,discountPence:p.discountPence,
 payablePence:p.netPence,units:p.units
});
/** This function is called only after a fresh server-side Bigin membership price check. */
export async function verifiedTicketPromotion(args:{
 db:DB;formId:string;code?:string;quote:BookingPrice;diagnostics:BookingDiagnostics;
 email:string;continueAsNonMember:boolean;secret:string
}):Promise<VerifiedTicketPromotion|null>{
 const {db,formId,quote,diagnostics,email,continueAsNonMember,secret}=args;
 if(!args.code?.trim())return null;
 let code:string;
 try{code=normaliseCode(args.code);}catch{throw new AppError('Invalid discount code for this booking form.',409);}
 if(!quote.canRegister||quote.unitAmount===null||quote.total===null)throw new AppError('Check your ticket prices and membership before applying a code.',409);
 const r=await db.from('icsh_event_discounts').select('*').eq('scope_kind','tickets').eq('scope_id',formId).eq('code',code).maybeSingle();
 if(r.error)throw new AppError('Discount codes are temporarily unavailable.',503);
 if(!r.data)throw new AppError('Invalid discount code for this booking form.',409);
 const d=config(r.data);
 if(!d.active)throw new AppError('This discount code is inactive.',409);
 const paidMemberVerified=!continueAsNonMember&&quote.memberStatus==='active'
  &&diagnostics.matchedCount===1&&!diagnostics.hasMore
  &&diagnostics.records.length===1
  &&diagnostics.records[0].paymentStatus?.trim().toLowerCase()==='completed';
 let calculated;
 try{calculated=calculateDiscount(d,[
  {category:'adult',quantity:quote.adultQuantity,unitPence:quote.unitAmount},
  {category:'child',quantity:quote.childQuantity,unitPence:quote.childUnitAmount||0}
 ],paidMemberVerified);}catch(error){throw new AppError(error instanceof Error?error.message:'The discount is unavailable.',409);}
 // The SQL INSERT trigger rechecks availability under a FOR UPDATE lock.
 // This read is only helpful feedback; it never authorises a reservation.
 const customerHash=createHmac('sha256',secret).update('icsh-discount-customer-v1:'+email.toLowerCase()).digest('hex');
 const rows=await db.from('icsh_event_discount_redemptions').select('units,status,customer_hash')
  .eq('discount_id',d.id).in('status',['reserved','redeemed']);
 if(rows.error||!Array.isArray(rows.data))throw new AppError('Discount availability could not be checked.',503);
 const used=rows.data.reduce((n:number,x:{units:number})=>n+x.units,0);
 if(used+calculated.units>d.maximum)throw new AppError('This discount has reached its maximum redemptions.',409);
 if(d.perCustomerMaximum!==null){
  const own=rows.data.filter((x:{customer_hash:string})=>x.customer_hash===customerHash)
   .reduce((n:number,x:{units:number})=>n+x.units,0);
  if(own+calculated.units>d.perCustomerMaximum)throw new AppError('This discount has reached the limit for this customer.',409);
 }
 return {code,name:d.name,grossPence:calculated.grossPence,discountPence:calculated.discountPence,
  netPence:calculated.payablePence,units:calculated.units,discountId:d.id,scopeKind:'tickets',
  scopeId:formId,customerHash,paidMemberVerified};
}
