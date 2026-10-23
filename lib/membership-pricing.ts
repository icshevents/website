// Single configuration for confirmed rates and eligibility boundaries.
export const MEMBERSHIP_PRICING=Object.freeze({currency:'GBP' as const,durationMonths:12 as const,standardFee:20,pensionerFee:15,studentFee:0,pensionerMinimumAge:65,studentMinimumAge:17,studentMaximumAgeExclusive:22,freeMinorMaximumAge:16,registrationMinimumAge:17,status:'confirmed' as const});
export const MEMBERSHIP_PAYMENT_TEST_FEE=1;
export function isMembershipPaymentTest(value:{firstName?:unknown;lastName?:unknown}):boolean {
 return typeof value.firstName==='string'&&typeof value.lastName==='string'&&value.firstName.trim().toLowerCase()==='test'&&value.lastName.trim().toLowerCase()==='test';
}
