import { londonDate, parseDate } from './membership.ts';

export type MembershipValiditySource = 'bigin_created_time' | 'corrected_start_date' | 'verified_payment';
export type MembershipValidity = {
  status: 'current' | 'expired' | 'not_started';
  startDate: string;
  /** Exclusive boundary: membership must be renewed on this UK calendar date. */
  expiryDate: string;
  source: MembershipValiditySource;
  provisional: boolean;
} | { status: 'unresolved'; reason: string };

export type BiginMembershipDates = { createdTime?: unknown; correctedStartDate?: unknown };

function validDate(value: unknown): value is string {
  // Positive, four-digit calendar years keep the ISO dates and Intl formatting
  // unambiguous. parseDate also rejects impossible dates instead of rolling them.
  return typeof value === 'string' && value >= '0001-01-01' && parseDate(value) !== null;
}

function timestampToLondonDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match || !validDate(match[1])) return null;
  const [, , hour, minute, second, , zone, , offsetHour, offsetMinute] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59 ||
    (zone !== 'Z' && (Number(offsetHour) > 23 || Number(offsetMinute) > 59))) return null;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const date = londonDate(instant);
  return validDate(date) ? date : null;
}

function period(startDate: string, source: MembershipValiditySource, on: string): MembershipValidity {
  const [year, month, day] = startDate.split('-');
  const followingYear = String(Number(year) + 1).padStart(4, '0');
  let expiryDate = `${followingYear}-${month}-${day}`;
  // Twelve calendar months: the anniversary of 29 February is constrained to
  // 28 February when the following year has no leap day.
  if (month === '02' && day === '29' && !validDate(expiryDate)) expiryDate = `${followingYear}-02-28`;
  if (!validDate(expiryDate)) return { status: 'unresolved', reason: 'The membership anniversary is outside the supported date range.' };
  return {
    status: on < startDate ? 'not_started' : on >= expiryDate ? 'expired' : 'current',
    startDate,
    expiryDate,
    source,
    provisional: source === 'bigin_created_time',
  };
}

/**
 * Resolve dates for an existing Bigin contact. A nonempty correction must be a
 * valid ISO date; a bad correction cannot silently restore a provisional date.
 * "current" describes only the date window, never identity, payment or active
 * member status. Callers must establish those facts separately.
 */
export function resolveBiginMembershipValidity(input: BiginMembershipDates = {}, on = londonDate()): MembershipValidity {
  if (!validDate(on)) return { status: 'unresolved', reason: 'The reference date must be a valid ISO calendar date.' };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { status: 'unresolved', reason: 'Bigin membership dates are missing or invalid.' };
  const correction = input.correctedStartDate;
  const blankCorrection = correction === undefined || correction === null || (typeof correction === 'string' && correction.trim() === '');
  if (!blankCorrection) {
    if (!validDate(correction)) return { status: 'unresolved', reason: 'The corrected membership start date must be a valid ISO calendar date.' };
    return period(correction, 'corrected_start_date', on);
  }
  const startDate = timestampToLondonDate(input.createdTime);
  if (!startDate) return { status: 'unresolved', reason: 'Bigin Created_Time must be a valid timestamp with a timezone.' };
  return period(startDate, 'bigin_created_time', on);
}

/**
 * Resolve a fresh paid term. The caller must first verify a successful membership
 * payment; this date-only function does not authenticate or verify the payment.
 * Old Bigin corrections are intentionally not inputs to a new payment period.
 */
export function resolvePaidMembershipValidity(verifiedPaidAt: unknown, on = londonDate()): MembershipValidity {
  if (!validDate(on)) return { status: 'unresolved', reason: 'The reference date must be a valid ISO calendar date.' };
  const startDate = timestampToLondonDate(verifiedPaidAt);
  if (!startDate) return { status: 'unresolved', reason: 'The verified payment time must be a valid timestamp with a timezone.' };
  return period(startDate, 'verified_payment', on);
}
