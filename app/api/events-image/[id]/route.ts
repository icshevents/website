import {z} from 'zod';
import {createEventService} from '@/lib/event-forms/service.js';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!z.uuid().safeParse(id).success)return new Response(null,{status:404});
 try{const db=createEventService(),r=await db.rpc('icsh_events_image',{p_id:id});if(r.error||!r.data)return new Response(null,{status:404});const image=await db.storage.from('icsh-event-images').download(r.data);if(image.error||!image.data)return new Response(null,{status:404});return new Response(image.data,{headers:{'Content-Type':image.data.type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});}catch{return new Response(null,{status:404});}
}
