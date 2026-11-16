import {eventFormDocument} from '@/lib/event-forms/shell';
import {bookingAccess} from '@/lib/events-hub/booking-access';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{const access=await bookingAccess('festival','500893f1-5724-547a-bd5c-8eae0e648890');if(!access.visible)return new Response('This event is not published.',{status:404});if(access.managed&&!access.canBook&&access.slug)return Response.redirect(new URL('/events/'+access.slug,request.url),303);return eventFormDocument(request,false);}catch{return new Response('Event information is temporarily unavailable.',{status:503});}
}
