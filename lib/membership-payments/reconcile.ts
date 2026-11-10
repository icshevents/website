import {digest,type PaymentApplication,type PaymentConfig,type PaymentRow,type StripeMembershipClient} from './core.ts';
type Outcome=ReturnType<StripeMembershipClient['verifiedOutcome']>;
type Dependencies={limit():Promise<boolean>;client:Pick<StripeMembershipClient,'retrieve'|'verifiedOutcome'>;record(outcome:Outcome,marker:string):Promise<PaymentRow>;activate():Promise<unknown>};
/** Only call after verifying the application's receipt capability. Never creates a charge. */
export async function reconcilePaidCheckout(application:PaymentApplication&{deletedAt?:string|null},payment:PaymentRow|null,activation:string|null,config:PaymentConfig,deps:Dependencies):Promise<PaymentRow|null>{
 if(!payment||!payment.session_id||application.deletedAt||application.feePence<=0||application.mode!==config.mode||payment.application_id!==application.id||payment.account_id!==config.account||payment.mode!==config.mode||payment.amount!==application.feePence||payment.currency!=='gbp')return payment;
 if(['refunded','partially_refunded','disputed'].includes(payment.status)||payment.status==='paid'&&['active','review_required'].includes(activation||''))return payment;
 if(!await deps.limit())return payment;
 const session=await deps.client.retrieve(payment.session_id);
 // The session is bound both to the saved Checkout mapping and to the immutable application.
 if(session.id!==payment.session_id)throw new Error('CHECKOUT_MAPPING_MISMATCH');
 const outcome=deps.client.verifiedOutcome(session,application);
 if(!['paid','partially_refunded','refunded','disputed'].includes(outcome.status))return payment;
 const marker='reconcile_'+digest([payment.session_id,outcome.status,outcome.refundedAmount].join(':'));
 const saved=await deps.record(outcome,marker);
 if(saved.application_id!==application.id||saved.account_id!==config.account||saved.mode!==config.mode||saved.session_id!==payment.session_id||saved.amount!==application.feePence||saved.currency!=='gbp')throw new Error('PAYMENT_RECORD_MISMATCH');
 if(saved.status==='paid'&&config.mode==='live')await deps.activate();
 return saved;
}
