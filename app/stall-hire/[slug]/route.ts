import {eventFormDocument} from '@/lib/event-forms/shell';
import {bookingAccess} from '@/lib/events-hub/booking-access';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{slug:string}>}){
 try{const access=await bookingAccess('form',(await context.params).slug);if(!access.visible)return new Response('This event is not published.',{status:404});if(access.managed&&!access.canBook&&access.slug)return Response.redirect(new URL('/events/'+access.slug,request.url),303);return eventFormDocument(request,false);}catch{return new Response('Event information is temporarily unavailable.',{status:503});}
}
