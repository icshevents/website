import type {SupabaseClient} from '@supabase/supabase-js';
type SignInDependencies={allowAttempt:()=>Promise<boolean>;client:()=>Promise<SupabaseClient|null>;verify:(client:SupabaseClient)=>Promise<{status:string}>};
export async function passwordOrganiserSignIn(form:FormData,deps:SignInDependencies):Promise<{ok:true}|{error:string}>{
 const password=form.get('password');
 if(typeof password!=='string'||!password||password.length>1024)return{error:'Enter the organiser password.'};
 try{
  if(!await deps.allowAttempt())return{error:'Too many sign-in attempts. Please wait ten minutes and try again.'};
  const client=await deps.client();
  if(!client)return{error:'Organiser sign-in is temporarily unavailable. Please contact ICSH.'};
  // Only the server selects the shared account; the browser cannot choose another identity.
  const {data,error}=await client.auth.signInWithPassword({email:'admin@icsh.org.uk',password});
  if(error||!data.user)return{error:'Unable to sign in. Check the password and try again.'};
  if(data.user.email?.toLowerCase()!=='admin@icsh.org.uk'||(await deps.verify(client)).status!=='organiser'){
   await client.auth.signOut({scope:'local'});
   return{error:'Organiser access could not be confirmed. Please contact ICSH.'};
  }
  return{ok:true};
 }catch{return{error:'Sign-in is temporarily unavailable. Please try again shortly.'};}
}
