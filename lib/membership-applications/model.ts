import type { Category } from '../membership.ts';
import type { MembershipAnswers } from '../membership-validation.ts';

export const MEMBERSHIP_SYNC_STATUSES = [
  'awaiting_authorisation', 'ready', 'syncing', 'synced',
  'review_required', 'outcome_unknown', 'failed',
] as const;
export type MembershipBiginSyncStatus = typeof MEMBERSHIP_SYNC_STATUSES[number];
export type MembershipApplicationPaymentStatus = 'awaiting_payment' | 'not_required';

export type SaveMembershipApplicationInput = {
  id: string;
  mode: 'test' | 'live';
  requestHash: string;
  capabilityHash: string;
  answers: MembershipAnswers;
  category: Category;
  feePence: number;
  paymentStatus: MembershipApplicationPaymentStatus;
};

/** Server-side record. Never return hashes, answers or claim metadata in a public receipt. */
export type MembershipApplication = SaveMembershipApplicationInput & {
  reference: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  currency: 'GBP';
  mode: 'test' | 'live';
  testData: boolean;
  applicationStatus: 'received';
  startDate: null;
  expiryDate: null;
  biginSyncStatus: MembershipBiginSyncStatus;
  biginRecordId: string | null;
  biginSyncedAt: string | null;
  lastErrorCode: string | null;
  syncAttempts: number;
  syncClaimId: string | null;
  syncLeaseUntil: string | null;
};

export type MembershipBiginSyncOutcome = {
  status: Exclude<MembershipBiginSyncStatus, 'ready' | 'syncing'>;
  biginRecordId?: string | null;
  errorCode?: string | null;
};
