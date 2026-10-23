import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { signedPublicSession } from '../event-forms/security.js';
import { londonDate } from '../membership.ts';
import { publicMembershipEligibility, membershipEligibilityMessage, type MembershipIdentity, type MembershipEligibility } from '../membership-eligibility.ts';
import { getQuote, registrationAgeError, validateApplication, type MembershipAnswers } from '../membership-validation.ts';
import type { MembershipApplication, MembershipBiginSyncOutcome, SaveMembershipApplicationInput } from './model.ts';

export type MembershipApiDependencies = {
  secret: string;
  available: () => Promise<boolean>;
  checkIdentity: (identity: MembershipIdentity) => Promise<MembershipEligibility>;
  rateLimit: (key: string, maximum: number) => Promise<boolean>;
  save: (input: SaveMembershipApplicationInput) => Promise<{ application: MembershipApplication; created: boolean }>;
  get: (id: string) => Promise<MembershipApplication | null>;
  list: () => Promise<MembershipApplication[]>;
  session: () => Promise<{ status: string }>;
  claim: (id: string, claimId: string) => Promise<MembershipApplication | null>;
  complete: (id: string, claimId: string, outcome: MembershipBiginSyncOutcome) => Promise<MembershipApplication | null>;
  sync: (application: MembershipApplication) => Promise<MembershipBiginSyncOutcome>;
  writesEnabled: boolean;
  today?: () => string;
};

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};
const uuid = z.string().uuid();
const token = z.string().regex(/^[a-f0-9]{64}$/);
const answersSchema = z.object({
  kind: z.enum(['new', 'renewal']), firstName: z.string().max(80), lastName: z.string().max(80),
  dob: z.string().max(10), mobile: z.string().max(25), email: z.string().max(254),
  education: z.enum(['', 'yes', 'no']), studentDeclaration: z.boolean(), terms: z.boolean(), accuracy: z.boolean(),
}).strict();
const submissionSchema = z.object({
  requestKey: uuid, receiptToken: token, answers: answersSchema,
  testData: z.literal(false).optional().default(false), website: z.literal(''),
}).strict();

class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function membershipFailure(error: unknown, operation: 'submission' | 'delivery' = 'submission'): Response {
  if (error instanceof ApiError) return Response.json({ ok: false, error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } }, { status: error.status, headers });
  if (error && typeof error === 'object' && 'code' in error && error.code === 'MEMBERSHIP_REQUEST_CONFLICT') {
    return Response.json({ ok: false, error: { code: 'MEMBERSHIP_REQUEST_CONFLICT', message: 'This submission reference was already used with different answers. Review the form before trying again.' } }, { status: 409, headers });
  }
  if (error && typeof error === 'object' && 'code' in error && error.code === 'MEMBERSHIP_SYNC_CONFLICT') {
    return Response.json({ ok: false, error: { code: 'MEMBERSHIP_SYNC_CONFLICT', message: 'The application status changed elsewhere. The application remains saved. Reload its status before continuing; do not resubmit the application.' } }, { status: 409, headers });
  }
  if (error && typeof error === 'object' && 'code' in error && ['MEMBERSHIP_EMAIL_IN_USE', 'MEMBERSHIP_PHONE_IN_USE'].includes(String(error.code))) {
    return Response.json({ ok: false, error: { code: error.code, message: 'An application already uses this email address or phone number. Please contact ICSH about the saved application instead of submitting another.' } }, { status: 409, headers });
  }
  if (operation === 'delivery') return Response.json({ ok: false, error: { code: 'MEMBERSHIP_DELIVERY_UNAVAILABLE', message: 'The application status could not be checked. The application remains saved on the website. Reload its status before trying again.' } }, { status: 503, headers });
  return Response.json({ ok: false, error: { code: 'MEMBERSHIP_UNAVAILABLE', message: 'We could not confirm that your application was saved. Your answers remain in this form. Please retry using the same form.' } }, { status: 503, headers });
}

function equal(a: string, b: string) {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function checkOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Submit the form from the ICSH website.');
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, 'JSON_REQUIRED', 'The form submission format is not supported.');
}

function publicSession(request: Request, secret: string) {
  if (secret.length < 32) throw new ApiError(503, 'MEMBERSHIP_SETUP_REQUIRED', 'Membership submissions are not available yet. Your answers have not been sent.');
  const secure = new URL(request.url).protocol === 'https:';
  const cookieName = secure ? '__Host-icsh-membership' : 'icsh-membership';
  const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const namespaced = createHmac('sha256', secret).update('icsh-membership-session-v1').digest('hex');
  const signed = signedPublicSession(namespaced, cookie);
  return { ...signed, cookieName, existing: cookie, secure };
}

async function readJson(request: Request): Promise<unknown> {
  if (!request.body) throw new ApiError(400, 'INVALID_SUBMISSION', 'Review the form and try again.');
  const reader = request.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 16_000) { await reader.cancel(); throw new ApiError(413, 'SUBMISSION_TOO_LARGE', 'This application is too large.'); }
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'INVALID_SUBMISSION', 'The application could not be read. Review the form and try again.');
  } finally { reader.releaseLock(); }
}

async function limit(request: Request, deps: MembershipApiDependencies, prefix: string, maximum: number) {
  const address = (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const key = createHmac('sha256', deps.secret).update(`icsh-membership:${prefix}:${address}`).digest('hex');
  if (!await deps.rateLimit('membership:' + key, maximum)) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Please wait ten minutes before trying again.');
}

/** Explicit projection: never include applicant details, hashes, claims or CRM IDs in a public receipt. */
export function membershipReceipt(application: MembershipApplication) {
  return {
    id: application.id, reference: application.reference, createdAt: application.createdAt,
    category: application.category, feePence: application.feePence, currency: application.currency,
    paymentStatus: application.paymentStatus, biginSyncStatus: application.biginSyncStatus,
    mode: application.mode,
  };
}

/** Save is confirmed before delivery starts. A durable lease prevents duplicate
 * Contact POSTs; interrupted or unknown creations must be reconciled, not retried. */
export async function deliverSavedMembershipApplication(application: MembershipApplication, deps: MembershipApiDependencies): Promise<MembershipApplication> {
  if (application.deletedAt || !deps.writesEnabled || application.biginSyncStatus === 'synced' || application.biginSyncStatus === 'review_required' ||
    (application.biginSyncStatus === 'outcome_unknown' && !application.biginRecordId)) return application;
  let claimed: MembershipApplication | null = null;
  try {
    const claimId = randomUUID();
    claimed = await deps.claim(application.id, claimId);
    if (!claimed) return await deps.get(application.id) ?? application;
    let outcome: MembershipBiginSyncOutcome;
    try { outcome = await deps.sync(claimed); }
    catch { outcome = { status: 'outcome_unknown', errorCode: 'SYNC_INTERRUPTED' }; }
    return await deps.complete(application.id, claimId, outcome) ?? claimed;
  } catch {
    // The application is durably saved even if delivery or its acknowledgement
    // is interrupted. Show only confirmed storage state, never invent success.
    try { return await deps.get(application.id) ?? claimed ?? application; }
    catch { return claimed ?? application; }
  }
}

export async function handleMembershipApplications(request: Request, deps: MembershipApiDependencies): Promise<Response> {
  try {
    if (!['GET', 'POST'].includes(request.method)) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use the membership form to submit an application.');
    const session = publicSession(request, deps.secret);
    if (request.method === 'GET') {
      if (request.headers.get('sec-fetch-site') === 'cross-site') throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Open the membership form on the ICSH website.');
      if (!await deps.available()) throw new ApiError(503, 'MEMBERSHIP_SETUP_REQUIRED', 'Membership submissions are not available yet. Your answers have not been sent.');
      return Response.json({ ok: true, mode: 'live', available: true, csrf: session.csrf }, { headers: {
        ...headers,
        'Set-Cookie': `${session.cookieName}=${session.cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${session.secure ? '; Secure' : ''}`,
      } });
    }
    checkOrigin(request);
    if (session.existing !== session.cookie || !equal(request.headers.get('x-csrf-token') ?? '', session.csrf)) throw new ApiError(403, 'SESSION_CHANGED', 'Your form session changed. Retry without closing this form.');
    await limit(request, deps, 'submit', 20);
    const parsed = submissionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, 'INVALID_SUBMISSION', 'Review all required answers before submitting.');
    const answers: MembershipAnswers = {
      ...parsed.data.answers,
      firstName: parsed.data.answers.firstName.trim(), lastName: parsed.data.answers.lastName.trim(),
      email: parsed.data.answers.email.trim().toLowerCase(), mobile: parsed.data.answers.mobile.trim(), dob: parsed.data.answers.dob.trim(),
    };
    const on = (deps.today ?? londonDate)();
    const fields = validateApplication(answers, on);
    if (Object.keys(fields).length) throw new ApiError(400, 'VALIDATION_FAILED', 'Please correct the highlighted answers.', fields);
    const quote = getQuote(answers, on);
    if (!quote || registrationAgeError(quote)) throw new ApiError(400, 'VALIDATION_FAILED', 'Membership applications are available from age 17.');
    const requestHash = hash(JSON.stringify({ answers, mode: 'live', policy: '2026-10-22-live' }));
    // This fresh server check cannot be skipped by bypassing the form or by
    // changing a browser's previous eligibility result.
    let eligibility: MembershipEligibility;
    try {
      eligibility = publicMembershipEligibility(await deps.checkIdentity({ kind: answers.kind as 'new' | 'renewal', firstName: answers.firstName, lastName: answers.lastName, email: answers.email, mobile: answers.mobile }));
    } catch {
      const saved = await deps.get(parsed.data.requestKey.toLowerCase());
      if (saved && equal(saved.requestHash, requestHash) && equal(saved.capabilityHash, hash(parsed.data.receiptToken))) return Response.json({ ok: true, application: membershipReceipt(await deliverSavedMembershipApplication(saved, deps)) }, { headers });
      throw new ApiError(503, 'MEMBERSHIP_CHECK_UNAVAILABLE', 'We could not check your current membership. Please try again later. No new application has been saved.');
    }
    if (eligibility.status !== 'allowed') {
      // Recover a previously confirmed save with its private receipt capability,
      // even if membership changed while an uncertain submission was retried.
      const saved = await deps.get(parsed.data.requestKey.toLowerCase());
      if (saved && equal(saved.requestHash, requestHash) && equal(saved.capabilityHash, hash(parsed.data.receiptToken))) return Response.json({ ok: true, application: membershipReceipt(await deliverSavedMembershipApplication(saved, deps)) }, { headers });
      return Response.json({ ok: false, error: { code: 'MEMBERSHIP_CHECK_BLOCKED', message: membershipEligibilityMessage(eligibility) }, eligibility }, { status: 409, headers });
    }
    const result = await deps.save({
      id: parsed.data.requestKey.toLowerCase(), mode: 'live', requestHash, capabilityHash: hash(parsed.data.receiptToken),
      answers, category: quote.category, feePence: quote.fee * 100,
      paymentStatus: quote.fee > 0 ? 'awaiting_payment' : 'not_required',
    });
    const delivered = await deliverSavedMembershipApplication(result.application, deps);
    return Response.json({ ok: true, application: membershipReceipt(delivered) }, { status: result.created ? 201 : 200, headers });
  } catch (error) { return membershipFailure(error); }
}

export async function handleMembershipReceipt(request: Request, id: string, deps: MembershipApiDependencies): Promise<Response> {
  try {
    if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This action is not supported.');
    const capability = request.headers.get('x-membership-receipt') ?? '';
    if (!uuid.safeParse(id).success || !token.safeParse(capability).success) throw new ApiError(404, 'APPLICATION_NOT_FOUND', 'Application not found.');
    await limit(request, deps, 'receipt', 100);
    const application = await deps.get(id);
    if (!application || !equal(application.capabilityHash, hash(capability))) throw new ApiError(404, 'APPLICATION_NOT_FOUND', 'Application not found.');
    return Response.json({ ok: true, application: membershipReceipt(application) }, { headers });
  } catch (error) { return membershipFailure(error); }
}

export async function handleMembershipAdmin(request: Request, id: string | undefined, deps: MembershipApiDependencies): Promise<Response> {
  try {
    if (!['GET', 'POST'].includes(request.method)) throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This action is not supported.');
    const session = await deps.session();
    if (session.status === 'signed-out') throw new ApiError(401, 'SIGN_IN_REQUIRED', 'Sign in to your organiser account.');
    if (session.status === 'forbidden') throw new ApiError(403, 'ORGANISER_REQUIRED', 'An approved organiser account is required.');
    if (session.status !== 'organiser') throw new ApiError(503, 'ACCESS_UNAVAILABLE', 'Organiser access could not be confirmed.');
    if (request.method === 'GET' && !id) {
      const applications = await deps.list();
      return Response.json({ ok: true, writesEnabled: deps.writesEnabled, applications: applications.map(application => ({
        ...membershipReceipt(application), answers: application.answers, updatedAt: application.updatedAt,
        biginRecordId: application.biginRecordId, lastErrorCode: application.lastErrorCode,
      })) }, { headers });
    }
    if (request.method !== 'POST' || !id || !uuid.safeParse(id).success) throw new ApiError(404, 'APPLICATION_NOT_FOUND', 'Application not found.');
    checkOrigin(request);
    const body = await readJson(request);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw new ApiError(400, 'INVALID_ACTION', 'Use the application review button.');
    if (!deps.writesEnabled) throw new ApiError(409, 'BIGIN_AUTHORISATION_REQUIRED', 'This application remains saved and is awaiting ICSH review.');
    await limit(request, deps, 'sync', 30);
    const existing = await deps.get(id);
    if (!existing) throw new ApiError(404, 'APPLICATION_NOT_FOUND', 'Application not found.');
    if (existing.biginSyncStatus === 'synced') return Response.json({ ok: true, application: membershipReceipt(existing) }, { headers });
    const claimId = randomUUID();
    const application = await deps.claim(id, claimId);
    if (!application) throw new ApiError(409, 'SYNC_REVIEW_REQUIRED', 'This application is already being checked or needs manual review. Reload its status before continuing.');
    let outcome: MembershipBiginSyncOutcome;
    try { outcome = await deps.sync(application); }
    catch { outcome = { status: 'outcome_unknown', errorCode: 'SYNC_INTERRUPTED' }; }
    const completed = await deps.complete(id, claimId, outcome);
    if (!completed) throw new ApiError(409, 'SYNC_REVIEW_REQUIRED', 'The sync result needs review. Do not create another contact for this application.');
    return Response.json({ ok: true, application: membershipReceipt(completed) }, { headers });
  } catch (error) { return membershipFailure(error, 'delivery'); }
}
