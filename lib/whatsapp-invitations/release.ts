/** Paid and free invitations each require their own configured/tested native workflow. */
export function invitationWorkflowReady(env:Record<string,string|undefined>,kind:'paid'|'free'='paid'){
 const prefix=kind==='free'?'ZOHO_BIGIN_WHATSAPP_FREE':'ZOHO_BIGIN_WHATSAPP';
 return env[prefix+'_RELEASE_MODE']==='owner-test'
  ? env[prefix+'_WORKFLOW_CONFIGURED']==='true'
  : env[prefix+'_RELEASE_MODE']==='live'&&env[prefix+'_WORKFLOW_VERIFIED']==='true';
}
