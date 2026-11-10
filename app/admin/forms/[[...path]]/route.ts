import {eventFormDocument} from '@/lib/event-forms/shell';
export const dynamic='force-dynamic';
export async function GET(request:Request){return eventFormDocument(request,true);}
