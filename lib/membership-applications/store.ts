// Server-side only. The default client uses the existing protected Supabase secret.
// Public routes must return a receipt projection, never a complete stored record.
import { z } from 'zod';
import { createEventService } from '../event-forms/service.js';
import { MEMBERSHIP_SYNC_STATUSES } from './model.ts';
import type { MembershipApplication, MembershipBiginSyncOutcome, SaveMembershipApplicationInput } from './model.ts';

export type MembershipStoreDatabase = Pick<ReturnType<typeof createEventService>, 'from' | 'rpc'>;
export class MembershipStoreError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'MembershipStoreError';
    this.code = code;
    this.status = status;
  }
}

const uuid = z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const recordId = z.string().regex(/^[0-9]{1,40}$/);
const timestamp = z.string().datetime({ offset: true });
const answers = z.object({
  kind: z.enum(['new', 'renewal']), firstName: z.string().min(1).max(80), lastName: z.string().min(1).max(80),
  dob: z.string().min(1).max(10), mobile: z.string().min(1).max(25),
  email: z.string().max(254).regex(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/),
  education: z.enum(['', 'yes', 'no']), studentDeclaration: z.boolean(), terms: z.literal(true), accuracy: z.literal(true),
}).strict();
const saveInput = z.object({
  id: uuid, mode: z.enum(['test', 'live']).default('test'), requestHash: hash, capabilityHash: hash, answers,
  category: z.enum(['standard', 'pensioner', 'student']), feePence: z.number().int().min(0).max(1000000),
  paymentStatus: z.enum(['awaiting_payment', 'not_required']),
}).strict().refine(input => input.mode === 'live' || input.answers.email.endsWith('@example.invalid')).refine(input => input.feePence === 0 ? input.paymentStatus === 'not_required' : input.paymentStatus === 'awaiting_payment');
const row = z.object({
  id: uuid, reference: z.string().regex(/^TEST-MEM-[A-F0-9]{32}$/), request_hash: hash, capability_hash: hash,
  answers, category: z.enum(['standard', 'pensioner', 'student']), fee_pence: z.number().int().min(0).max(1000000),
  currency: z.literal('GBP'), mode: z.enum(['test', 'live']), test_data: z.boolean(),
  payment_status: z.enum(['awaiting_payment', 'not_required']), application_status: z.literal('received'),
  start_date: z.null(), expiry_date: z.null(), bigin_sync_status: z.enum(MEMBERSHIP_SYNC_STATUSES),
  bigin_record_id: recordId.nullable(), bigin_synced_at: timestamp.nullable(),
  last_error_code: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/).nullable(),
  sync_attempts: z.number().int().nonnegative(), sync_claim_id: uuid.nullable(), sync_lease_until: timestamp.nullable(),
  created_at: timestamp, updated_at: timestamp,
}).refine(value => value.fee_pence === 0 ? value.payment_status === 'not_required' : value.payment_status === 'awaiting_payment')
  .refine(value => value.bigin_sync_status !== 'synced' || Boolean(value.bigin_record_id && value.bigin_synced_at))
  .refine(value => value.bigin_sync_status !== 'syncing' || Boolean(value.sync_claim_id && value.sync_lease_until));
const columns = 'id,reference,request_hash,capability_hash,answers,category,fee_pence,currency,mode,test_data,payment_status,application_status,start_date,expiry_date,bigin_sync_status,bigin_record_id,bigin_synced_at,last_error_code,sync_attempts,sync_claim_id,sync_lease_until,created_at,updated_at';

function invalidInput(): MembershipStoreError {
  return new MembershipStoreError('MEMBERSHIP_INVALID_INPUT', 400, 'The membership application request is invalid.');
}
function invalidResponse(): MembershipStoreError {
  return new MembershipStoreError('MEMBERSHIP_STORAGE_INVALID_RESPONSE', 503, 'Membership application storage returned an unexpected result.');
}
function unavailable(): MembershipStoreError {
  return new MembershipStoreError('MEMBERSHIP_STORAGE_UNAVAILABLE', 503, 'Membership application storage is temporarily unavailable.');
}
function databaseError(code?: string): MembershipStoreError {
  if (code === 'P2001') return new MembershipStoreError('MEMBERSHIP_EMAIL_IN_USE', 409, 'An application already uses this email address.');
  if (code === 'P2002') return new MembershipStoreError('MEMBERSHIP_PHONE_IN_USE', 409, 'An application already uses this phone number.');
  if (code === '23505') return new MembershipStoreError('MEMBERSHIP_REQUEST_CONFLICT', 409, 'This application reference is already in use. Keep your details and retry with a new application.');
  if (code === '40001') return new MembershipStoreError('MEMBERSHIP_SYNC_CONFLICT', 409, 'This application changed elsewhere. Reload its status before continuing.');
  if (['22023', '23514', '23502', '22P02'].includes(code || '')) return invalidInput();
  return unavailable();
}
function database(supplied?: MembershipStoreDatabase): MembershipStoreDatabase {
  try { return supplied ?? createEventService(); }
  catch { throw unavailable(); }
}
async function result(operation: () => PromiseLike<{ data: unknown; error: { code?: string } | null }>): Promise<unknown> {
  try {
    const response = await operation();
    if (response.error) throw databaseError(response.error.code);
    return response.data;
  } catch (error) {
    if (error instanceof MembershipStoreError) throw error;
    throw unavailable();
  }
}
function application(value: unknown): MembershipApplication {
  const parsed = row.safeParse(value);
  if (!parsed.success) throw invalidResponse();
  const r = parsed.data;
  if (r.test_data !== (r.mode === 'test')) throw invalidResponse();
  if (r.mode === 'test' && !r.answers.email.endsWith('@example.invalid')) throw invalidResponse();
  if (r.reference !== `TEST-MEM-${r.id.replaceAll('-', '').toUpperCase()}`) throw invalidResponse();
  return {
    id: r.id, reference: r.mode === 'live' ? r.reference.replace(/^TEST-/, '') : r.reference, requestHash: r.request_hash, capabilityHash: r.capability_hash,
    answers: r.answers, category: r.category, feePence: r.fee_pence, currency: r.currency, mode: r.mode, testData: r.test_data,
    paymentStatus: r.payment_status, applicationStatus: r.application_status, startDate: null, expiryDate: null,
    biginSyncStatus: r.bigin_sync_status, biginRecordId: r.bigin_record_id, biginSyncedAt: r.bigin_synced_at,
    lastErrorCode: r.last_error_code, syncAttempts: r.sync_attempts, syncClaimId: r.sync_claim_id,
    syncLeaseUntil: r.sync_lease_until, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
function validId(id: string): void { if (!uuid.safeParse(id).success) throw invalidInput(); }

export async function saveMembershipApplication(input: SaveMembershipApplicationInput, supplied?: MembershipStoreDatabase): Promise<{ application: MembershipApplication; created: boolean }> {
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) throw invalidInput();
  const value = parsed.data, db = database(supplied);
  const raw = await result(() => db.rpc('icsh_membership_application_save', {
    p_id: value.id, p_mode: value.mode, p_request_hash: value.requestHash, p_capability_hash: value.capabilityHash,
    p_answers: value.answers, p_category: value.category, p_fee_pence: value.feePence, p_payment_status: value.paymentStatus,
  }));
  if (!raw || typeof raw !== 'object' || !('application' in raw) || !('created' in raw) || typeof raw.created !== 'boolean') throw invalidResponse();
  const saved = application(raw.application);
  if (saved.id.toLowerCase() !== value.id.toLowerCase() || saved.requestHash !== value.requestHash || saved.capabilityHash !== value.capabilityHash) throw invalidResponse();
  return { application: saved, created: raw.created };
}

/** The caller must verify a receipt capability or organiser access before disclosing this record. */
export async function getMembershipApplication(id: string, supplied?: MembershipStoreDatabase): Promise<MembershipApplication | null> {
  validId(id); const db = database(supplied);
  const raw = await result(() => db.from('icsh_membership_applications').select(columns).eq('id', id).maybeSingle());
  if (raw === null) return null;
  const saved = application(raw);
  if (saved.id.toLowerCase() !== id.toLowerCase()) throw invalidResponse();
  return saved;
}

/** Authenticate the organiser first. No browser role has access to the underlying table. */
export async function listMembershipApplications(limit = 100, supplied?: MembershipStoreDatabase): Promise<MembershipApplication[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalidInput();
  const db = database(supplied);
  const raw = await result(() => db.from('icsh_membership_applications').select(columns).order('created_at', { ascending: false }).order('id').limit(limit));
  if (!Array.isArray(raw) || raw.length > limit) throw invalidResponse();
  return raw.map(application);
}

/** A returned record with biginRecordId may only be GET-verified, never created again. */
export async function claimMembershipBiginSync(id: string, claimId: string, supplied?: MembershipStoreDatabase): Promise<MembershipApplication | null> {
  validId(id); validId(claimId); const db = database(supplied);
  const raw = await result(() => db.rpc('icsh_membership_bigin_claim', { p_id: id, p_claim_id: claimId }));
  if (raw === null) return null;
  const saved = application(raw);
  if (saved.id.toLowerCase() !== id.toLowerCase() || saved.biginSyncStatus !== 'syncing' || saved.syncClaimId?.toLowerCase() !== claimId.toLowerCase()) throw invalidResponse();
  return saved;
}

// Only recognised internal/provider codes are persisted; arbitrary errors may contain personal data or credentials.
const safeSyncCodes = new Set([
  'ZOHO_NOT_CONFIGURED', 'ZOHO_CONFIGURATION_INVALID', 'ZOHO_REQUEST_NOT_ALLOWED', 'ZOHO_AUTHENTICATION_FAILED',
  'ZOHO_SCOPE_MISMATCH', 'ZOHO_RATE_LIMITED', 'ZOHO_UNAVAILABLE', 'ZOHO_INVALID_RESPONSE', 'ZOHO_PROVIDER_REJECTED',
  'ZOHO_MEMBERSHIP_WRITES_DISABLED', 'ZOHO_WRITE_OUTCOME_UNKNOWN', 'SYNC_LEASE_EXPIRED',
  'BIGIN_MATCH_REVIEW_REQUIRED', 'BIGIN_RECORD_MISMATCH', 'BIGIN_RENEWAL_REVIEW_REQUIRED', 'BIGIN_SYNC_DISABLED',
  'BIGIN_AUTHORISATION_REQUIRED', 'RENEWAL', 'EXISTING_CONTACT', 'SEARCH_INCOMPLETE', 'PREVIOUS_CREATION_ATTEMPT',
  'CONTACT_VERIFICATION_MISMATCH', 'INVALID_TEST_APPLICATION', 'INVALID_APPLICATION', 'SYNC_INTERRUPTED',
  'MEMBERSHIP_SYNC_FAILED',
]);
export async function completeMembershipBiginSync(id: string, claimId: string, outcome: MembershipBiginSyncOutcome, supplied?: MembershipStoreDatabase): Promise<MembershipApplication> {
  validId(id); validId(claimId);
  const parsed = z.object({
    status: z.enum(['awaiting_authorisation', 'synced', 'review_required', 'outcome_unknown', 'failed']),
    biginRecordId: recordId.nullish(), errorCode: z.string().nullish(),
  }).strict().safeParse(outcome);
  if (!parsed.success) throw invalidInput();
  const value = parsed.data;
  const safeError = value.status === 'synced' || !value.errorCode ? null : safeSyncCodes.has(value.errorCode) ? value.errorCode : 'MEMBERSHIP_SYNC_FAILED';
  const db = database(supplied);
  const raw = await result(() => db.rpc('icsh_membership_bigin_complete', {
    p_id: id, p_claim_id: claimId, p_status: value.status,
    p_bigin_record_id: value.biginRecordId ?? null, p_error_code: safeError,
  }));
  const saved = application(raw);
  if (saved.id.toLowerCase() !== id.toLowerCase() || saved.biginSyncStatus !== value.status || saved.syncClaimId !== null || saved.syncLeaseUntil !== null ||
    (value.biginRecordId && saved.biginRecordId !== value.biginRecordId)) throw invalidResponse();
  return saved;
}
