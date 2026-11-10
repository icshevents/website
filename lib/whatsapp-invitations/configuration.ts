import {invitationConfigurationReady,type InvitationConfiguration} from './core.ts';
import {invitationWorkflowReady} from './release.ts';

// Separate approval gates prevent sending the payment-confirmation template to a free member.
export function invitationConfiguration(env:Record<string,string|undefined>,kind:'paid'|'free'='paid'):InvitationConfiguration|null{
 const prefix=kind==='free'?'ZOHO_BIGIN_WHATSAPP_FREE':'ZOHO_BIGIN_WHATSAPP';
 if(env.VERCEL_ENV!=='production'||env.ZOHO_BIGIN_MEMBERSHIP_ACTIVATION_ENABLED!=='true'||env.ZOHO_BIGIN_MEMBERSHIP_WRITES_ENABLED!=='true'||
  !invitationWorkflowReady(env,kind)||env[prefix+'_TEMPLATE_APPROVED']!=='true')return null;
 const ownerTest=env[prefix+'_RELEASE_MODE']==='owner-test';
 const config:InvitationConfiguration={enabled:env[prefix+'_INVITATIONS_ENABLED']==='true',approved:env[prefix+'_TEMPLATE_APPROVED']==='true',
  accountId:kind==='free'?'free':env.STRIPE_ACCOUNT_ID||'',sender:env.ZOHO_BIGIN_WHATSAPP_SENDER||'',templateName:env[prefix+'_TEMPLATE_NAME']||'',
  category:env[prefix+'_TEMPLATE_CATEGORY'] as 'utility'|'marketing',applicationsFrom:env[prefix+'_INVITATIONS_FROM']||'',
  ...(kind==='free'?{membershipKind:'free' as const}:{}),...(ownerTest?{ownerTestOnly:true}: {})};
 return invitationConfigurationReady(config)?config:null;
}
