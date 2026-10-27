import { runEventApi } from '@/lib/event-forms/api.js';
import {scheduleFormEmails} from '@/lib/form-emails/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  return scheduleFormEmails(request,await runEventApi(request, path.join('/')));
}
export { handle as GET, handle as POST };
