import {eventFormDocument} from '@/lib/event-forms/shell';
import {bookingAccess} from '@/lib/events-hub/booking-access';
import {createEventService} from '@/lib/event-forms/service.js';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){try{const {path}=await params;const slug=path[0];if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||!(path.length===1||path.length===3&&path[1]==='confirmation'&&/^[a-f0-9-]{36}$/.test(path[2])))return new Response('Not found',{status:404});
 const f=await createEventService().from('icsh_forms').select('id').eq('slug',slug).eq('kind','participation').maybeSingle();if(f.error)throw Error('Unavailable');if(!f.data)return new Response('Not found',{status:404});
 if(path.length===1){const access=await bookingAccess('form',slug);if(!access.visible)return new Response('This event is not published.',{status:404});if(!access.canBook&&!access.limitReached&&access.slug)return Response.redirect(new URL('/events/'+access.slug,request.url),303);}
 return eventFormDocument(request,false);
}catch{return new Response('Event information is temporarily unavailable.',{status:503});}}
