import {getQuote,validateApplication} from '../membership-validation.ts';
import {londonDate} from '../membership.ts';
import type {MembershipApplication} from '../membership-applications/model.ts';
/** Recheck the saved server quote at application time, never a browser fee. */
export function eligibleFreeMembership(a:MembershipApplication):boolean {
 if(a.mode!=='live'||a.testData||a.deletedAt||a.feePence!==0||a.paymentStatus!=='not_required'||a.category!=='student')return false;
 if(!(a.biginSyncStatus==='synced'||a.biginSyncStatus==='review_required'&&a.lastErrorCode==='RENEWAL'))return false;
 const created=new Date(a.createdAt);if(!Number.isFinite(created.getTime()))return false;
 const on=londonDate(created),quote=getQuote(a.answers,on);
 return Object.keys(validateApplication(a.answers,on)).length===0&&quote?.category==='student'&&quote.fee===0;
}
