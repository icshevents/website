import {isMembershipPaymentTest} from './membership-pricing.ts';

// Owner-requested, date-limited rehearsal. Normal rates resume automatically.
export const MEMBERSHIP_LAUNCH_TEST_DATE='2026-10-28';
export function isMembershipLaunchTest(value:{firstName?:unknown;lastName?:unknown;kind?:unknown},on:string):boolean {
 return on===MEMBERSHIP_LAUNCH_TEST_DATE&&isMembershipPaymentTest(value)&&['new','renewal'].includes(String(value.kind));
}
export function initialLaunchTestTerm(){return {startDate:'2025-10-28',expiryDate:MEMBERSHIP_LAUNCH_TEST_DATE};}
