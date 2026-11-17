'use client';
import {useEffect,useState} from 'react';
import './notifications.css';
export type NoticeTone='success'|'error'|'progress';
let noticeVersion=0;
export const workspaceNoticeVersion=()=>noticeVersion;
export function notifyWorkspace(message:string,tone:NoticeTone='success'){if(typeof window!=='undefined'){noticeVersion++;window.dispatchEvent(new CustomEvent('icsh-workspace-notice',{detail:{message,tone,at:Date.now()}}));}}
export default function WorkspaceNotifications(){const [notice,setNotice]=useState<{message:string;tone:NoticeTone;at:number}|null>(null);useEffect(()=>{const show=(e:Event)=>setNotice((e as CustomEvent).detail);window.addEventListener('icsh-workspace-notice',show);return()=>window.removeEventListener('icsh-workspace-notice',show);},[]);useEffect(()=>{if(!notice||notice.tone==='progress')return;const id=setTimeout(()=>setNotice(null),10000);return()=>clearTimeout(id);},[notice]);return notice?<aside className={'workspace-notice notice-'+notice.tone} role={notice.tone==='error'?'alert':'status'} aria-live={notice.tone==='error'?'assertive':'polite'}><span className="workspace-notice-icon" aria-hidden="true">{notice.tone==='success'?'✓':notice.tone==='error'?'!':'…'}</span><div><strong>{notice.tone==='success'?'Success':notice.tone==='error'?'Action could not be completed':'Working…'}</strong><p>{notice.message}</p></div><button type="button" aria-label="Dismiss notification" onClick={()=>setNotice(null)}>×</button></aside>:null;}
