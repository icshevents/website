import {createHash,timingSafeEqual} from 'node:crypto';
import type {Confirmation,EmailKind,MailEnvironment} from './core';

export const setupKinds:EmailKind[]=['membership_active','membership_reminder','donation','rishta','event','stall'];
export function authorisedSetupTest(request:Request,env:MailEnvironment){
  const secret=env.FORM_EMAIL_SETUP_TEST_SECRET||'';
  if(env.FORM_EMAIL_SETUP_TEST_ENABLED!=='true'||secret.length<32)return false;
  const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(request.headers.get('authorization')||'');
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export function setupConfirmation(kind:EmailKind,secret:string):Confirmation{
  const hash=createHash('sha256').update(secret+'|'+kind).digest('hex').slice(0,32);
  const id=[hash.slice(0,8),hash.slice(8,12),hash.slice(12,16),hash.slice(16,20),hash.slice(20)].join('-');
  return {id,kind,recipient:'events@icsh.org.uk',reference:'TEST-SETUP-'+kind.replaceAll('_','-').toUpperCase(),event_title:'Fictional test event',membership_number:'TEST1234',start_date:'2026-10-26',expiry_date:'2027-10-25',test:true};
}
