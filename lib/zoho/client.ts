// Import this module through lib/zoho/server.ts in the application. That entry
// point enforces the server-only boundary; this pure module is injectable in tests.
import { membershipMobileKey, type MembershipRecordSearch } from '../membership-eligibility.ts';
import { parseMemberSearch, projectMembershipSearch, type MemberSearchInput, type MemberSearchResult, type MembershipSearchRecord } from '../member-search.ts';

export type ZohoService = 'bigin' | 'campaigns';
export type ZohoQuery = Record<string, string | number>;
export type ZohoEnvironment = Record<string, string | undefined>;
export type ZohoConfigurationStatus = { configured: boolean; missing: string[]; issues: string[] };

const ERRORS = {
  ZOHO_NOT_CONFIGURED: [503, 'The Zoho connection has not been configured.'],
  ZOHO_CONFIGURATION_INVALID: [503, 'The Zoho connection settings need to be corrected.'],
  ZOHO_REQUEST_NOT_ALLOWED: [400, 'This Zoho request is not allowed.'],
  ZOHO_AUTHENTICATION_FAILED: [502, 'Zoho could not authenticate this connection. Check its credentials and data center.'],
  ZOHO_SCOPE_MISMATCH: [502, 'The Zoho connection does not have the required read permissions.'],
  ZOHO_RATE_LIMITED: [503, 'Zoho is temporarily limiting requests. Try again shortly.'],
  ZOHO_UNAVAILABLE: [502, 'Zoho could not be reached. Try again later.'],
  ZOHO_INVALID_RESPONSE: [502, 'Zoho returned an unexpected response.'],
  ZOHO_PROVIDER_REJECTED: [502, 'Zoho could not complete this read-only check.'],
  ZOHO_MEMBERSHIP_WRITES_DISABLED: [503, 'Bigin membership application delivery has not been enabled.'],
  ZOHO_WRITE_OUTCOME_UNKNOWN: [502, 'Bigin may have received this application. Organiser review is required before another delivery attempt.'],
} as const;
export type ZohoErrorCode = keyof typeof ERRORS;

export class ZohoError extends Error {
  readonly code: ZohoErrorCode;
  readonly status: number;
  constructor(code: ZohoErrorCode) {
    super(ERRORS[code][1]);
    this.name = 'ZohoError';
    this.code = code;
    this.status = ERRORS[code][0];
  }
}

/** A Contact POST was started, so callers must not retry creation automatically. */
export class BiginContactCreateError extends ZohoError {
  readonly outcome = 'unknown' as const;
  constructor(code: ZohoErrorCode = 'ZOHO_WRITE_OUTCOME_UNKNOWN') {
    super(code);
    this.name = 'BiginContactCreateError';
  }
}

// These are deliberately inactive values for new website applications,
// not inferred values from existing members. No activation/date fields are sent.
export type BiginPendingContactCreate = {
  First_Name: string;
  Last_Name: string;
  Email: string;
  Mobile: string;
  Membership_Status: 'Inactive';
  Payment_Status: 'Awaiting payment' | 'Not required';
  Email_Opt_Out: true;
};
export type BiginContactSearch = {
  matches: Array<{ id: string; email: string }>;
  hasMore: boolean;
};
export type BiginPaidMembershipUpdate = {
  Membership_Status: 'Active';
  Payment_Status: 'Completed';
  Membership_Date: string;
  Expiry_Date: string;
};
export type BiginContact = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  mobile: string | null;
  membershipStatus: string | null;
  paymentStatus: string | null;
  emailOptOut: boolean | null;
  membershipDate: string | null;
  membershipExpiry: string | null;
};

function contactId(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,29}$/.test(value);
}

function contactEmail(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 254 || /[\r\n\0]/.test(value)) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null;
}

function pendingContactPayload(value: unknown): BiginPendingContactCreate {
  const keys = ['First_Name', 'Last_Name', 'Email', 'Mobile', 'Membership_Status', 'Payment_Status', 'Email_Opt_Out'];
  if (!object(value) || Object.keys(value).length !== keys.length ||
    !keys.every(key => Object.prototype.hasOwnProperty.call(value, key))) throw new ZohoError('ZOHO_REQUEST_NOT_ALLOWED');
  const safeName = (name: unknown): name is string => typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 80 && !/[<>\u0000-\u001f]/.test(name);
  const email = contactEmail(value.Email);
  if (!safeName(value.First_Name) || !safeName(value.Last_Name) || !email ||
    typeof value.Mobile !== 'string' || value.Mobile.length > 25 || !/^[\d() .+-]+$/.test(value.Mobile) ||
    value.Mobile.replace(/\D/g, '').length < 7 || value.Mobile.replace(/\D/g, '').length > 15 ||
    value.Membership_Status !== 'Inactive' || (value.Payment_Status !== 'Awaiting payment' && value.Payment_Status !== 'Not required') ||
    value.Email_Opt_Out !== true) throw new ZohoError('ZOHO_REQUEST_NOT_ALLOWED');
  // Copy before any await: callers cannot mutate the validated body in flight.
  return {
    First_Name: value.First_Name.trim(), Last_Name: value.Last_Name.trim(), Email: email, Mobile: value.Mobile.trim(),
    Membership_Status: 'Inactive', Payment_Status: value.Payment_Status as BiginPendingContactCreate['Payment_Status'], Email_Opt_Out: true,
  };
}

// Account and resource origins must belong to the same documented data center.
// Unknown hosts fail closed rather than receiving an OAuth token or client secret.
const REGIONS = [
  { accounts: 'https://accounts.zoho.com', bigin: 'https://www.zohoapis.com', campaigns: 'https://campaigns.zoho.com' },
  { accounts: 'https://accounts.zoho.eu', bigin: 'https://www.zohoapis.eu', campaigns: 'https://campaigns.zoho.eu' },
  { accounts: 'https://accounts.zoho.com.au', bigin: 'https://www.zohoapis.com.au', campaigns: 'https://campaigns.zoho.com.au' },
  { accounts: 'https://accounts.zoho.in', bigin: 'https://www.zohoapis.in', campaigns: 'https://campaigns.zoho.in' },
  { accounts: 'https://accounts.zoho.com.cn', bigin: 'https://www.zohoapis.com.cn', campaigns: 'https://campaigns.zoho.com.cn' },
  { accounts: 'https://accounts.zoho.jp', bigin: 'https://www.zohoapis.jp', campaigns: 'https://campaigns.zoho.jp' },
  { accounts: 'https://accounts.zoho.sa', bigin: 'https://www.zohoapis.sa', campaigns: null },
  { accounts: 'https://accounts.zohocloud.ca', bigin: 'https://www.zohoapis.ca', campaigns: null },
] as const;
type Region = (typeof REGIONS)[number];
type Configuration = {
  accounts: string; api: string; clientId: string; clientSecret: string; refreshToken: string; region: Region;
};
const SUFFIXES = ['ACCOUNTS_URL', 'CLIENT_ID', 'CLIENT_SECRET', 'REFRESH_TOKEN', 'API_DOMAIN'] as const;

function origin(value: unknown): string | null {
  if (typeof value !== 'string' || value !== value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

function inspectConfiguration(service: ZohoService, env: ZohoEnvironment) {
  const prefix = `ZOHO_${service.toUpperCase()}_`;
  const missing: string[] = [];
  const issues: string[] = [];
  for (const suffix of SUFFIXES) {
    const name = prefix + suffix;
    const value = env[name];
    if (!value?.trim()) missing.push(name);
    else if (value !== value.trim() || /[\r\n\0]/.test(value)) issues.push(`${name} must not contain surrounding whitespace or control characters.`);
  }
  const accounts = origin(env[prefix + 'ACCOUNTS_URL']);
  const api = origin(env[prefix + 'API_DOMAIN']);
  const region = REGIONS.find(item => item.accounts === accounts);
  if (env[prefix + 'ACCOUNTS_URL']?.trim() && !region) issues.push(`${prefix}ACCOUNTS_URL must be a supported Zoho HTTPS origin.`);
  if (env[prefix + 'API_DOMAIN']?.trim() && !REGIONS.some(item => item[service] === api && api !== null)) {
    issues.push(`${prefix}API_DOMAIN must be a supported ${service === 'bigin' ? 'Bigin' : 'Campaigns'} HTTPS origin.`);
  }
  if (region && api && region[service] !== api) issues.push('The Zoho accounts and API origins must use the same supported data center.');
  const status: ZohoConfigurationStatus = { configured: missing.length === 0 && issues.length === 0, missing, issues };
  const configuration: Configuration | null = status.configured && region && accounts && api ? {
    accounts, api, region,
    clientId: env[prefix + 'CLIENT_ID']!,
    clientSecret: env[prefix + 'CLIENT_SECRET']!,
    refreshToken: env[prefix + 'REFRESH_TOKEN']!,
  } : null;
  return { status, configuration };
}

export function getZohoConfiguration(service: ZohoService, env: ZohoEnvironment = process.env): ZohoConfigurationStatus {
  return inspectConfiguration(service, env).status;
}

const READ_ENDPOINTS: Record<ZohoService, Record<string, readonly string[]>> = {
  bigin: {
    '/bigin/v2/org': [],
    '/bigin/v2/settings/modules': [],
    '/bigin/v2/settings/fields': ['module'],
  },
  campaigns: {
    '/api/v1.1/getmailinglists': ['resfmt', 'fromindex', 'range', 'sort'],
    '/api/v1.1/topics': ['details'],
    '/api/v1.1/contact/allfields': ['type'],
    '/api/v1.1/workflow': ['details'],
  },
};

function checkedQuery(service: ZohoService, path: string, params: ZohoQuery): URLSearchParams {
  const allowed = READ_ENDPOINTS[service]?.[path];
  if (!Array.isArray(allowed) || !params || typeof params !== 'object' || Array.isArray(params)) throw new ZohoError('ZOHO_REQUEST_NOT_ALLOWED');
  const result = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (!allowed.includes(name) || (typeof value !== 'string' && typeof value !== 'number') ||
      (typeof value === 'number' && !Number.isFinite(value)) || String(value).length > 2_000) throw new ZohoError('ZOHO_REQUEST_NOT_ALLOWED');
    result.set(name, String(value));
  }
  if (service === 'bigin' && path === '/bigin/v2/settings/fields' && result.get('module') !== 'Contacts') {
    throw new ZohoError('ZOHO_REQUEST_NOT_ALLOWED');
  }
  return result;
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function providerError(status: number, data: unknown): ZohoError {
  const body = object(data) ? data : {};
  const wrapped = object(body.response) ? body.response : body;
  const code = String(wrapped.error ?? wrapped.code ?? '').toUpperCase();
  if (status === 429 || ['ACCESS_DENIED', 'TOO_MANY_REQUESTS', 'RATE_LIMIT_EXCEEDED'].includes(code)) return new ZohoError('ZOHO_RATE_LIMITED');
  if (status === 403 || ['OAUTH_SCOPE_MISMATCH', 'INVALID_SCOPE', 'NO_PERMISSION', 'AUTHORIZATION_FAILED'].includes(code)) return new ZohoError('ZOHO_SCOPE_MISMATCH');
  if (status === 401 || ['INVALID_CLIENT', 'INVALID_CLIENT_SECRET', 'INVALID_CODE', 'INVALID_TOKEN', 'INVALID_OAUTHTOKEN', 'INVALID_GRANT'].includes(code)) {
    return new ZohoError('ZOHO_AUTHENTICATION_FAILED');
  }
  if (status >= 500) return new ZohoError('ZOHO_UNAVAILABLE');
  return new ZohoError('ZOHO_PROVIDER_REJECTED');
}

function hasProviderError(data: unknown): boolean {
  if (!object(data)) return false;
  const candidates = [data, ...(object(data.response) ? [data.response] : [])];
  return candidates.some(body => {
    if (body.error || (typeof body.status === 'string' && ['error', 'failure', 'failed'].includes(body.status.toLowerCase()))) return true;
    return body.code !== undefined && !['0', '200', 'SUCCESS'].includes(String(body.code).toUpperCase());
  });
}

function isEmptyCampaignsList(service: ZohoService, path: string, data: unknown): boolean {
  if (service !== 'campaigns' || path !== '/api/v1.1/getmailinglists' || !object(data)) return false;
  const body = object(data.response) ? data.response : data;
  // Campaigns documents 2401 as "no mailing list has been created".
  return String(body.code) === '2401';
}

type Token = { value: string; expiresAt: number };
type TokenState = { key: string; token?: Token; pending?: Promise<Token>; cooldownUntil: number; cooldownCode?: ZohoErrorCode };
const REQUEST_TIMEOUT_MS = 10_000;
const AUTH_COOLDOWN_MS = 30_000;
const MAX_RESPONSE_CHARACTERS = 2_000_000;

export function createZohoClient(env: ZohoEnvironment = process.env, fetchImpl: typeof fetch = fetch) {
  // Memory-only access tokens, separate for each service and configuration. A
  // simultaneous metadata check shares one refresh in this server instance.
  const states = new Map<ZohoService, TokenState>();

  async function request(url: URL, init: RequestInit): Promise<{ status: number; data: unknown }> {
    try {
      const response = await fetchImpl(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status >= 300 && response.status < 400) throw new ZohoError('ZOHO_PROVIDER_REJECTED');
      const text = await response.text();
      if (text.length > MAX_RESPONSE_CHARACTERS) throw new ZohoError('ZOHO_INVALID_RESPONSE');
      let data: unknown;
      try { data = text ? JSON.parse(text) : null; }
      catch {
        if (!response.ok) throw providerError(response.status, null);
        throw new ZohoError('ZOHO_INVALID_RESPONSE');
      }
      if (!response.ok) throw providerError(response.status, data);
      return { status: response.status, data };
    } catch (error) {
      // Never attach provider messages, response bodies, URLs or exception causes.
      if (error instanceof ZohoError) throw error;
      throw new ZohoError('ZOHO_UNAVAILABLE');
    }
  }

  function stateFor(service: ZohoService, config: Configuration): TokenState {
    const key = JSON.stringify([config.accounts, config.api, config.clientId, config.clientSecret, config.refreshToken]);
    let state = states.get(service);
    if (!state || state.key !== key) {
      state = { key, cooldownUntil: 0 };
      states.set(service, state);
    }
    return state;
  }

  async function refresh(config: Configuration): Promise<Token> {
    const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: config.refreshToken, grant_type: 'refresh_token' });
    const response = await request(new URL('/oauth/v2/token', config.accounts), {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
    });
    if (hasProviderError(response.data)) throw providerError(response.status, response.data);
    if (!object(response.data)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
    const { access_token: token, expires_in: lifetime, api_domain: tokenDomain } = response.data;
    const seconds = typeof lifetime === 'number' ? lifetime : typeof lifetime === 'string' && /^\d+$/.test(lifetime) ? Number(lifetime) : NaN;
    if (typeof token !== 'string' || !token || token.length > 8_000 || /\s/.test(token) || !Number.isFinite(seconds) || seconds <= 0) {
      throw new ZohoError('ZOHO_INVALID_RESPONSE');
    }
    if (tokenDomain !== undefined) {
      const returnedOrigin = origin(tokenDomain);
      // Zoho also documents api.zoho.<region> in generic OAuth responses.
      // This only validates metadata: resource requests still use the explicit
      // configured service origin, never a host supplied by the token response.
      const genericOAuthApi = config.region.accounts.replace('https://accounts.', 'https://api.');
      if (!returnedOrigin || ![config.api, config.region.bigin, genericOAuthApi].includes(returnedOrigin)) throw new ZohoError('ZOHO_CONFIGURATION_INVALID');
    }
    const expiresInMs = Math.min(seconds, 3_600) * 1_000;
    return { value: token, expiresAt: Date.now() + expiresInMs - Math.min(60_000, expiresInMs / 10) };
  }

  async function accessToken(config: Configuration, state: TokenState): Promise<Token> {
    if (state.cooldownUntil > Date.now()) throw new ZohoError(state.cooldownCode ?? 'ZOHO_AUTHENTICATION_FAILED');
    if (state.token && state.token.expiresAt > Date.now()) return state.token;
    if (!state.pending) {
      state.pending = refresh(config).then(token => { state.token = token; return token; }).catch(error => {
        const safe = error instanceof ZohoError ? error : new ZohoError('ZOHO_UNAVAILABLE');
        state.cooldownUntil = Date.now() + AUTH_COOLDOWN_MS;
        state.cooldownCode = safe.code;
        throw safe;
      }).finally(() => { state.pending = undefined; });
    }
    return state.pending;
  }

  async function get(service: ZohoService, path: string, params: ZohoQuery = {}): Promise<unknown> {
    const query = checkedQuery(service, path, params);
    const { status, configuration } = inspectConfiguration(service, env);
    if (!configuration) throw new ZohoError(status.missing.length ? 'ZOHO_NOT_CONFIGURED' : 'ZOHO_CONFIGURATION_INVALID');
    const state = stateFor(service, configuration);
    const token = await accessToken(configuration, state);
    const url = new URL(path, configuration.api);
    url.search = query.toString();
    try {
      const response = await request(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Zoho-oauthtoken ${token.value}` } });
      if (hasProviderError(response.data) && !isEmptyCampaignsList(service, path, response.data)) throw providerError(response.status, response.data);
      if (!object(response.data) && !Array.isArray(response.data)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
      return response.data;
    } catch (error) {
      if (error instanceof ZohoError && ['ZOHO_AUTHENTICATION_FAILED', 'ZOHO_RATE_LIMITED'].includes(error.code)) {
        state.token = undefined;
        state.cooldownUntil = Date.now() + AUTH_COOLDOWN_MS;
        state.cooldownCode = error.code;
      }
      throw error;
    }
  }

  // Separate fixed Contact methods keep the metadata get() allowlist unchanged.
  // No caller-controlled URL, fields selection, criteria, method or POST envelope.
  async function biginRecordGet(path: string, query: URLSearchParams) {
    const { status, configuration } = inspectConfiguration('bigin', env);
    if (!configuration) throw new ZohoError(status.missing.length ? 'ZOHO_NOT_CONFIGURED' : 'ZOHO_CONFIGURATION_INVALID');
    const state = stateFor('bigin', configuration);
    const token = await accessToken(configuration, state);
    const url = new URL(path, configuration.api);
    url.search = query.toString();
    try {
      const response = await request(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Zoho-oauthtoken ${token.value}` } });
      if (hasProviderError(response.data)) throw providerError(response.status, response.data);
      return response;
    } catch (error) {
      if (error instanceof ZohoError && ['ZOHO_AUTHENTICATION_FAILED', 'ZOHO_RATE_LIMITED'].includes(error.code)) {
        state.token = undefined;
        state.cooldownUntil = Date.now() + AUTH_COOLDOWN_MS;
        state.cooldownCode = error.code;
      }
      throw error;
    }
  }

  async function searchBiginContactsByEmail(value: string): Promise<BiginContactSearch> {
    const email = contactEmail(value);
    if (!email) throw new ZohoError('ZOHO_REQUEST_NOT_ALLOWED');
    const response = await biginRecordGet('/bigin/v2/Contacts/search', new URLSearchParams({ email, page: '1', per_page: '2' }));
    if (response.status === 204 && response.data === null) return { matches: [], hasMore: false };
    const data = response.data;
    if (!object(data) || !Array.isArray(data.data) || data.data.length > 2 || !object(data.info) ||
      typeof data.info.more_records !== 'boolean') throw new ZohoError('ZOHO_INVALID_RESPONSE');
    const matches: BiginContactSearch['matches'] = [];
    for (const record of data.data as unknown[]) {
      if (!object(record) || !contactId(record.id)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
      const returnedEmail = contactEmail(record.Email);
      if (!returnedEmail) throw new ZohoError('ZOHO_INVALID_RESPONSE');
      // Provider search is not an identity assertion. Validate an exact match
      // locally and leave any additional page for organiser review.
      if (returnedEmail === email) matches.push({ id: record.id, email: returnedEmail });
    }
    return { matches, hasMore: data.info.more_records };
  }

  async function getBiginContact(id: string): Promise<BiginContact> {
    if (!contactId(id)) throw new ZohoError('ZOHO_REQUEST_NOT_ALLOWED');
    const fields = 'First_Name,Last_Name,Email,Mobile,Membership_Status,Payment_Status,Email_Opt_Out,Membership_Date,Expiry_Date';
    const response = await biginRecordGet(`/bigin/v2/Contacts/${id}`, new URLSearchParams({ fields }));
    const body = response.data;
    if (!object(body) || !Array.isArray(body.data) || body.data.length !== 1 || !object(body.data[0])) throw new ZohoError('ZOHO_INVALID_RESPONSE');
    const record = body.data[0];
    const email = contactEmail(record.Email);
    if (record.id !== id || !email) throw new ZohoError('ZOHO_INVALID_RESPONSE');
    const optionalText = (value: unknown): string | null => {
      if (value === undefined || value === null) return null;
      if (typeof value !== 'string' || value.length > 300 || /[\u0000-\u001f]/.test(value)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
      return value;
    };
    if (record.Email_Opt_Out !== undefined && record.Email_Opt_Out !== null && typeof record.Email_Opt_Out !== 'boolean') throw new ZohoError('ZOHO_INVALID_RESPONSE');
    return {
      id, email, firstName: optionalText(record.First_Name), lastName: optionalText(record.Last_Name), mobile: optionalText(record.Mobile),
      membershipStatus: optionalText(record.Membership_Status), paymentStatus: optionalText(record.Payment_Status), emailOptOut: record.Email_Opt_Out ?? null,
      membershipDate: optionalText(record.Membership_Date), membershipExpiry: optionalText(record.Expiry_Date),
    };
  }

  async function createBiginContact(value: BiginPendingContactCreate): Promise<{ contactId: string }> {
    if (env.ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED !== 'true') throw new ZohoError('ZOHO_MEMBERSHIP_WRITES_DISABLED');
    const payload = pendingContactPayload(value);
    const { status, configuration } = inspectConfiguration('bigin', env);
    if (!configuration) throw new ZohoError(status.missing.length ? 'ZOHO_NOT_CONFIGURED' : 'ZOHO_CONFIGURATION_INVALID');
    const state = stateFor('bigin', configuration);
    // Failures before the Contact request are safe to report as not delivered.
    const token = await accessToken(configuration, state);
    try {
      const response = await request(new URL('/bigin/v2/Contacts', configuration.api), {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Zoho-oauthtoken ${token.value}` },
        body: JSON.stringify({ data: [payload], trigger: [] }),
      });
      if (hasProviderError(response.data)) throw providerError(response.status, response.data);
      if (!object(response.data) || !Array.isArray(response.data.data) || response.data.data.length !== 1) throw new ZohoError('ZOHO_INVALID_RESPONSE');
      const record: unknown = response.data.data[0];
      if (!object(record) || record.code !== 'SUCCESS' || record.status !== 'success') throw new ZohoError('ZOHO_PROVIDER_REJECTED');
      if (!object(record.details) || !contactId(record.details.id)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
      return { contactId: record.details.id };
    } catch (error) {
      // The POST has started. Even an explicit rejection stays conservatively
      // non-retryable; a lease owner must record/reconcile this outcome first.
      if (error instanceof ZohoError && ['ZOHO_AUTHENTICATION_FAILED', 'ZOHO_RATE_LIMITED'].includes(error.code)) {
        state.token = undefined;
        state.cooldownUntil = Date.now() + AUTH_COOLDOWN_MS;
        state.cooldownCode = error.code;
      }
      throw new BiginContactCreateError(error instanceof ZohoError ? error.code : 'ZOHO_WRITE_OUTCOME_UNKNOWN');
    }
  }

  async function searchBiginMembershipRecords(value: MemberSearchInput): Promise<MembershipRecordSearch> {
    const mobile = value?.method === 'mobile' ? membershipMobileKey(value.mobile) : null;
    const input = value?.method === 'mobile' && mobile ? { method: 'mobile' as const, mobile } : parseMemberSearch(value);
    const query = new URLSearchParams({ page: '1', per_page: '200' });
    if (input.method === 'name') query.set('criteria', `(Full_Name:equals:${input.firstName} ${input.lastName})`);
    else if (input.method === 'email') query.set('email', input.email);
    else query.set('phone', input.mobile);
    const response = await biginRecordGet('/bigin/v2/Contacts/search', query);
    if (response.status === 204 && response.data === null) return { records: [], hasMore: false };
    const body = response.data;
    if (!object(body) || !Array.isArray(body.data) || body.data.length > 200 || !object(body.info) || typeof body.info.more_records !== 'boolean') throw new ZohoError('ZOHO_INVALID_RESPONSE');
    const records: MembershipSearchRecord[] = body.data.map((item: unknown) => {
      if (!object(item) || !contactId(item.id)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
      const optionalText = (key: string): string | null => {
        const v = item[key];
        if (v === undefined || v === null) return null;
        if (typeof v !== 'string' || v.length > 300 || /[\u0000-\u001f]/.test(v)) throw new ZohoError('ZOHO_INVALID_RESPONSE');
        return v;
      };
      return { id: item.id, fullName: optionalText('Full_Name'), email: optionalText('Email'), mobile: optionalText('Mobile'),
        membershipStatus: optionalText('Membership_Status'), paymentStatus: optionalText('Payment_Status'),
        membershipDate: optionalText('Membership_Date'), membershipExpiry: optionalText('Expiry_Date') };
    });
    return { records, hasMore: body.info.more_records };
  }

  async function lookupBiginMembership(value: MemberSearchInput, on?: string): Promise<MemberSearchResult> {
    const input = parseMemberSearch(value);
    const result = await searchBiginMembershipRecords(input);
    return projectMembershipSearch(input, result.records, result.hasMore, on);
  }

  async function updateBiginPaidMembership(id: string, value: BiginPaidMembershipUpdate): Promise<void> {
    if (env.ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED !== 'true' || env.ZOHO_BIGIN_MEMBERSHIP_ACTIVATION_ENABLED !== 'true') throw new ZohoError('ZOHO_MEMBERSHIP_WRITES_DISABLED');
    const keys=['Membership_Status','Payment_Status','Membership_Date','Expiry_Date'];
    const validDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
    if(!contactId(id)||!object(value)||Object.keys(value).length!==4||!keys.every(key=>Object.hasOwn(value,key))||value.Membership_Status!=='Active'||value.Payment_Status!=='Completed'||!validDate(value.Membership_Date)||!validDate(value.Expiry_Date)||value.Expiry_Date<=value.Membership_Date)throw new ZohoError('ZOHO_REQUEST_NOT_ALLOWED');
    const payload={Membership_Status:'Active',Payment_Status:'Completed',Membership_Date:value.Membership_Date,Expiry_Date:value.Expiry_Date};
    const {status,configuration}=inspectConfiguration('bigin',env);if(!configuration)throw new ZohoError(status.missing.length?'ZOHO_NOT_CONFIGURED':'ZOHO_CONFIGURATION_INVALID');
    const state=stateFor('bigin',configuration),token=await accessToken(configuration,state);
    const response=await request(new URL('/bigin/v2/Contacts/'+id,configuration.api),{method:'PUT',headers:{Accept:'application/json','Content-Type':'application/json',Authorization:`Zoho-oauthtoken ${token.value}`},body:JSON.stringify({data:[payload],trigger:[]})});
    if(hasProviderError(response.data))throw providerError(response.status,response.data);
    const records=object(response.data)&&Array.isArray(response.data.data)?response.data.data:[];
    if(records.length!==1||!object(records[0])||records[0].code!=='SUCCESS'||records[0].status!=='success'||!object(records[0].details)||records[0].details.id!==id)throw new ZohoError('ZOHO_PROVIDER_REJECTED');
  }
  return { get, searchBiginMembershipRecords, searchBiginContactsByEmail, getBiginContact, createBiginContact, updateBiginPaidMembership, lookupBiginMembership, getConfiguration: (service: ZohoService) => getZohoConfiguration(service, env) };
}

const defaultClient = createZohoClient();
export const zohoGet = defaultClient.get;
export const searchBiginContactsByEmail = defaultClient.searchBiginContactsByEmail;
export const getBiginContact = defaultClient.getBiginContact;
export const createBiginContact = defaultClient.createBiginContact;
export const lookupBiginMembership = defaultClient.lookupBiginMembership;
