import { createHmac } from 'node:crypto';
import { publicMembershipEligibility, parseMembershipIdentity, type MembershipIdentity, type MembershipEligibility } from './membership-eligibility.ts';
import {z} from 'zod';
import {EMPTY_ANSWERS,getQuote,registrationAgeError} from './membership-validation.ts';
import {londonDate} from './membership.ts';
import {testMembershipQuote} from './membership-test-pricing.ts';

export type MembershipEligibilityDependencies = {
  secret: string;
  rateLimit: (key: string, maximum: number) => Promise<boolean>;
  check: (identity: MembershipIdentity) => Promise<MembershipEligibility>;
  testPricingEnabled?:boolean;
  today?:()=>string;
};
const headers = { 'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
const reply = (value: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(value, { status, headers: { ...headers, ...extra } });
export async function handleMembershipEligibility(request: Request, deps: MembershipEligibilityDependencies): Promise<Response> {
  try {
    if (request.method !== 'POST') return reply({ error: 'Use the joining or renewal form.' }, 405, { Allow: 'POST' });
    if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return reply({ error: 'Open the membership form on the ICSH website.' }, 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'The details could not be read.' }, 415);
    if (deps.secret.length < 32) throw new Error('Unavailable');
    const address = (request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
    const key = createHmac('sha256', deps.secret).update('icsh-membership-check:' + address).digest('hex');
    if (!await deps.rateLimit('membership-check:' + key, 20) || !await deps.rateLimit('membership-check:global', 500)) return reply({ error: 'Too many checks. Please wait ten minutes and try again.' }, 429, { 'Retry-After': '600' });
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: 'Enter your full name, email and phone number.' }, 400);
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      for (;;) {
        const part = await reader.read(); if (part.done) break;
        length += part.value.byteLength;
        if (length > 2000) { await reader.cancel(); return reply({ error: 'The details are too long.' }, 413); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    let identity: MembershipIdentity;let quoteInput:{dob:string;education:''|'yes'|'no'}|undefined;
    try {
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(body&&typeof body==='object'&&!Array.isArray(body)&&Object.hasOwn(body,'quote')){
        const {quote,...details}=body;
        quoteInput=z.object({dob:z.string().max(10),education:z.enum(['','yes','no'])}).strict().parse(quote);
        identity=parseMembershipIdentity(details);
      }else identity=parseMembershipIdentity(body);
    }
    catch { return reply({ error: 'Enter a valid full name, email address and phone number.' }, 400); }
    const result = publicMembershipEligibility(await deps.check(identity));
    // Copy only the public decision. CRM identifiers and contact details stay private.
    if (result.status === 'active') return reply({ status: 'active', membershipDate: result.membershipDate, membershipExpiry: result.membershipExpiry, daysUntilExpiry: result.daysUntilExpiry });
    if (!['allowed', 'identity_conflict', 'review_required', 'renewal_required', 'new_required'].includes(result.status)) throw new Error('Invalid decision');
    if(result.status==='allowed'&&quoteInput){
      const quote=testMembershipQuote(getQuote({...EMPTY_ANSWERS,...identity,...quoteInput},(deps.today??londonDate)()),identity.email,deps.testPricingEnabled);
      if(!quote||registrationAgeError(quote))return reply({error:'Enter a valid date of birth and membership category.'},400);
      return reply({status:'allowed',...(result.mobileChanged?{mobileChanged:true}:{}),quote:{category:quote.category,feePence:quote.fee*100,currency:'GBP'}});
    }
    return reply({ status: result.status,...(result.status==='allowed'&&result.mobileChanged?{mobileChanged:true}:{}) });
  } catch {
    return reply({ error: 'We could not check your membership right now. Please try again later. You cannot continue until the check succeeds.' }, 503);
  }
}
