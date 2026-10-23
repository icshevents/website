'use client';

import {useEffect, useId, useRef} from 'react';
import {usePathname} from 'next/navigation';
import Link from 'next/link';

const invitationSeenKey = 'icsh-homepage-membership-invitation-seen';

export default function MembershipInvitation({months}:{months:number}) {
  const pathname = usePathname();
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement|null>(null);
  const shown = useRef(false);
  const previousOverflow = useRef('');

  function openInvitation() {
    const modal = dialog.current;
    if (!modal || modal.open || document.querySelector('dialog[open]')) return;
    shown.current = true;
    try { window.sessionStorage.setItem(invitationSeenKey, '1'); } catch { /* Keep the in-memory fallback when storage is unavailable. */ }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : trigger.current;
    previousOverflow.current = document.body.style.overflow;
    modal.showModal();
    document.body.style.overflow = 'hidden';
  }
  function closeInvitation() {
    dialog.current?.close();
    document.body.style.overflow = previousOverflow.current;
  }
  function restorePage() {
    document.body.style.overflow = previousOverflow.current;
    if (returnFocus.current?.isConnected) returnFocus.current.focus({preventScroll:true});
  }

  useEffect(() => {
    dialog.current?.close();
    if (shown.current || pathname !== '/') return;
    try { if (window.sessionStorage.getItem(invitationSeenKey) === '1') return; } catch { /* The in-memory flag still prevents repeat prompts during navigation. */ }
    const modal = dialog.current;
    const timer = window.setTimeout(openInvitation, 7000);
    return () => {
      window.clearTimeout(timer);
      if (modal?.open) { modal.close(); document.body.style.overflow = previousOverflow.current; }
    };
  }, [pathname]);

  useEffect(() => () => { document.body.style.overflow = previousOverflow.current; }, []);

  if (pathname !== '/') return null;
  return <>
    <button ref={trigger} className="membership-invite-trigger" type="button" onClick={openInvitation} aria-haspopup="dialog">
      <span aria-hidden="true">✧</span> Discover membership <span aria-hidden="true">↗</span>
    </button>
    <dialog ref={dialog} className="invitation-dialog" aria-labelledby={titleId} aria-describedby={descriptionId} onClose={restorePage} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeInvitation();
    }}>
      <button className="close-dialog" type="button" aria-label="Close membership invitation" onClick={closeInvitation} autoFocus>×</button>
      <div className="invite-layout">
        <div className="invite-side">
          <img className="invite-image picnic-invitation" src="/assets/membership-picnic.webp" alt="ICSH community members sharing food at a picnic buffet" width="750" height="1000"/>

        </div>
        <div className="invite-copy">
          <span className="tag">Everyone welcome</span>
          <h2 id={titleId}>Find your community.</h2>
          <p id={descriptionId}>Make friends, share experiences and enjoy life with ICSH.</p>
          <p className="invite-duration">{months} months of belonging.</p>
          <Link className="button invite-cta" href="/membership" onClick={closeInvitation}>View membership options <span aria-hidden="true">→</span></Link>
          <button className="invite-later" type="button" onClick={closeInvitation}>Maybe later</button>
        </div>
      </div>
    </dialog>
  </>;
}
