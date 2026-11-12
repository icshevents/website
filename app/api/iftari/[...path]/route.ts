import { handleIftari } from '@/lib/iftari/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
async function run(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return handleIftari(request, (await context.params).path.join('/'));
}
export { run as GET, run as POST };
