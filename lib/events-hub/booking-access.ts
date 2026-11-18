import 'server-only';
import {createEventService} from '../event-forms/service.js';
export async function bookingAccess(type:'tickets'|'festival'|'iftari'|'form',key:string){
 if(process.env.ICSH_EVENTS_HUB_ENABLED!=='true')return {managed:false,visible:true,canBook:true,cancelled:false};
 const r=await createEventService().rpc('icsh_events_booking_access',{p_type:type,p_key:key});
 if(r.error)throw Error('Event access unavailable');return r.data as {managed:boolean;visible:boolean;canBook:boolean;cancelled:boolean;limitReached?:boolean;slug?:string};
}
