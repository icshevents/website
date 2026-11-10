import {handleWebsitePayment} from '@/lib/payments/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(request:Request,{params}:{params:Promise<{kind:string;id:string}>}){const p=await params;return handleWebsitePayment(request,p.kind,p.id);}
export const GET=handle;
export const POST=handle;
