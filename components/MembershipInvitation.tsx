'use client';

import {useEffect, useId, useRef, useState} from 'react';
import {usePathname, useRouter} from 'next/navigation';

const invitationSeenKey = 'icsh-homepage-membership-invitation-seen';

const highlights = [
  ['cruise', 'Community trips'],
  ['heart', 'Friendship & connection'],
  ['people', 'Community gatherings'],
  ['spark', 'Cultural celebrations'],
  ['heart', 'Social & charity events'],
] as const;
const paths = {
  cruise: 'M3 15l9 5 9-5-3-2H6zM7 13V7h10v6M10 7V4h4v3M12 13v7M3 22c2-2 4 2 6 0s4 2 6 0 4 2 6 0',
  people: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M16 3a4 4 0 010 8M22 21v-2a4 4 0 00-3-3.87M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  spark: 'M12 3l2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7z',
  heart: 'M20.8 5.6a5 5 0 00-7.1 0L12 7.3l-1.7-1.7a5 5 0 00-7.1 7.1L12 21l8.8-8.3a5 5 0 000-7.1z',
};

export default function MembershipInvitation({months}:{months:number}) {
  const pathname = usePathname();
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement|null>(null);
  const shown = useRef(false);
  const previousOverflow = useRef('');
  const [category, setCategory] = useState('new');

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
          <div className="invite-side-copy">
            <span className="invite-small">COMMUNITY · FRIENDSHIP · BELONGING</span>
            <h3>Life is richer<br/>when it’s shared.</h3>
            <p>Make ICSH part of your story.</p>
            <span className="invite-year">Annual membership rates <strong>£0–£20</strong></span>
          </div>
        </div>
        <div className="invite-copy">
          <span className="tag">You’re invited</span>
          <h2 id={titleId}>Your next chapter<br/>starts with community.</h2>
          <p id={descriptionId}>Everyone is welcome at ICSH. Join us for shared experiences, new friendships and moments that bring us closer.</p>
          <div className="invite-highlights">
            {highlights.map(([icon, title]) => <div className="invite-highlight" key={title}>
              <span className="invite-highlight-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[icon]}/></svg></span>
              <strong>{title}</strong>
            </div>)}
          </div>
          <p className="invite-availability">£20 standard · £15 age 65+ · FREE for full-time students aged 17–21 inclusive. Children aged 16 and below are automatically dependants of a member and do not need to sign up. Everyone aged 17 and above must complete the joining or renewal form. Membership lasts {months} months from confirmed fee payment, or confirmed activation for free membership. Event dates and separate charges may vary.</p>
          <form onSubmit={event => {
            event.preventDefault();
            closeInvitation();
            router.push(`/membership?category=${category}#join`);
          }}>
            <fieldset className="invite-category">
              <legend>I’d like to</legend>
              <label><input type="radio" name="invite-category" value="new" checked={category === 'new'} onChange={() => setCategory('new')}/> Join ICSH</label>
              <label><input type="radio" name="invite-category" value="renewal" checked={category === 'renewal'} onChange={() => setCategory('renewal')}/> Renew membership</label>
            </fieldset>
            <button className="button invite-cta" type="submit">Explore membership options <span aria-hidden="true">→</span></button>
          </form>
          <button className="invite-later" type="button" onClick={closeInvitation}>Maybe later</button>
          <span className="invite-service-note">Applications are open. New applications are saved to Bigin as inactive while awaiting payment or confirmed activation. Online payments are not yet available.</span>
        </div>
      </div>
    </dialog>
  </>;
}
