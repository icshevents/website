import { runEventApi } from '@/lib/event-forms/api.js';
import {scheduleFormEmails} from '@/lib/form-emails/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
async function handle(request: Request, context: Context) {
  const { path } = await context.params;
  const action = path.join('/');
  const response = await runEventApi(request, action);
  return scheduleFormEmails(request, response, 4);
}
export { handle as GET, handle as POST };
