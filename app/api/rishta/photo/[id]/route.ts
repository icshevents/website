import {organiserSession} from '@/lib/supabase/server';
import {createEventService} from '@/lib/event-forms/service.js';
import {privateHeaders} from '@/lib/rishta/api';
import {rishtaPhotoBucket} from '@/lib/rishta/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const access=await organiserSession();if(access.status!=='organiser')return new Response('Organiser access required.',{status:403,headers:privateHeaders});
 const {id}=await params;if(!/^[a-f0-9-]{36}$/.test(id))return new Response('Not found.',{status:404,headers:privateHeaders});
 const profile=await access.supabase.from('icsh_rishta_profiles').select('photo_path').eq('id',id).maybeSingle();
 if(profile.error||!profile.data?.photo_path)return new Response('Not found.',{status:404,headers:privateHeaders});
 const photo=await createEventService().storage.from(rishtaPhotoBucket).download(profile.data.photo_path);
 if(photo.error||!photo.data)return new Response('Photograph unavailable.',{status:503,headers:privateHeaders});
 return new Response(photo.data,{headers:{...privateHeaders,'Content-Type':photo.data.type,'Content-Disposition':'inline; filename="profile-photo"','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
