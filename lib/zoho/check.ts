import { ZohoError, type ZohoService } from './client.ts';
import type { checkBiginConnection } from './bigin.ts';
import type { checkCampaignsConnection } from './campaigns.ts';

export type ConnectionConfiguration = { configured: boolean; missing: string[]; issues: string[] };
export type ConnectionResult =
  | { ok: true; service: 'bigin'; data: Awaited<ReturnType<typeof checkBiginConnection>> }
  | { ok: true; service: 'campaigns'; data: Awaited<ReturnType<typeof checkCampaignsConnection>> }
  | { ok: false; error: { code: string; message: string }; configuration?: ConnectionConfiguration };

type Dependencies = {
  session: () => Promise<{ status: string }>;
  configuration: (service: ZohoService) => ConnectionConfiguration;
  bigin: typeof checkBiginConnection;
  campaigns: typeof checkCampaignsConnection;
};

const privateHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Robots-Tag': 'noindex, nofollow',
};

function failure(status: number, code: string, message: string, configuration?: ConnectionConfiguration) {
  return Response.json({ ok: false, error: { code, message }, ...(configuration ? { configuration } : {}) }, { status, headers: privateHeaders });
}

async function readService(request: Request): Promise<ZohoService | null> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1024) { await reader.cancel(); return null; }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const keys = Object.keys(body);
    const service = (body as { service?: unknown }).service;
    return keys.length === 1 && (service === 'bigin' || service === 'campaigns') ? service : null;
  } catch { return null; }
  finally { reader.releaseLock(); }
}

// The route calls this only with server-owned dependencies. Neither credentials,
// upstream URLs nor CRM identifiers are accepted from the browser.
export async function handleZohoCheck(request: Request, dependencies: Dependencies): Promise<Response> {
  if (request.method !== 'POST') return failure(405, 'METHOD_NOT_ALLOWED', 'Use the connection check button.');
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return failure(403, 'ORIGIN_NOT_ALLOWED', 'Open the organiser workspace to check this connection.');
  }
  try {
    const session = await dependencies.session();
    if (session.status === 'signed-out') return failure(401, 'SIGN_IN_REQUIRED', 'Sign in to your organiser account, then try again.');
    if (session.status === 'forbidden') return failure(403, 'ORGANISER_REQUIRED', 'An approved organiser account is required.');
    if (session.status !== 'organiser') return failure(503, 'ACCESS_UNAVAILABLE', 'Organiser access could not be confirmed. Please try again shortly.');

    const service = await readService(request);
    if (!service) return failure(400, 'INVALID_SERVICE', 'Choose Bigin or Campaigns to check.');
    const configuration = dependencies.configuration(service);
    if (!configuration.configured) {
      return failure(503, 'SETUP_REQUIRED', 'Save the required Zoho settings in Vercel and redeploy the website before testing.', configuration);
    }
    const result: ConnectionResult = service === 'bigin'
      ? { ok: true, service, data: await dependencies.bigin() }
      : { ok: true, service, data: await dependencies.campaigns() };
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof ZohoError) return failure(error.status, error.code, error.message);
    // Do not return raw provider, network or authentication exceptions.
    return failure(503, 'CHECK_UNAVAILABLE', 'The connection check could not be completed. Please try again shortly.');
  }
}
