import 'server-only';
import {createEventService} from '../event-forms/service.js';
import type {CustomField} from './core';
export type PublicForm={id:string;slug:string;title:string;description:string;fields:CustomField[];version:number;eventTitle:string;eventSlug:string;open:boolean};
export async function publicCustomForm(slug:string):Promise<PublicForm|null>{if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return null;const r=await createEventService().rpc('icsh_custom_form_public',{p_slug:slug});if(r.error)throw Error('Event form unavailable');return r.data;}
