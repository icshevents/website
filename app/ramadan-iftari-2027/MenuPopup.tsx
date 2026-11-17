'use client';

import { useEffect, useRef } from 'react';
import styles from './menu.module.css';

import {defaultIftariMenu,type IftariMenu} from '@/lib/events-hub/iftari-menu';

export default function MenuPopup({menu=defaultIftariMenu,eventTitle='Ramadan Iftari 2027'}:{menu?:IftariMenu;eventTitle?:string}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousOverflow = useRef<string | null>(null);

  function restoreScroll() {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  }

  useEffect(() => () => restoreScroll(), []);

  function openMenu() {
    if (!dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    previousOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  if(!menu.enabled)return null;
  return <>
    <button ref={trigger} type="button" className={styles.menuLink} aria-haspopup="dialog" aria-controls="iftari-menu" onClick={openMenu}>View the menu <span aria-hidden="true">↗</span></button>
    <dialog ref={dialog} id="iftari-menu" className={styles.dialog} aria-labelledby="iftari-menu-title" onClose={() => { restoreScroll(); trigger.current?.focus({ preventScroll: true }); }} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.content}>
        <header className={styles.header}>
          <div><span className={styles.eyebrow}>{eventTitle}</span><h2 id="iftari-menu-title">{menu.title}</h2></div>
          <button type="button" className={styles.close} aria-label="Close menu" onClick={() => dialog.current?.close()}>Close <span aria-hidden="true">×</span></button>
        </header>
        <div className={styles.courses}>{menu.courses.map((course,index) => <section className={styles.course} key={index}><h3>{course.title}</h3><ul>{course.items.map((item,i) => <li key={i}>{item}</li>)}</ul></section>)}</div>
        <button type="button" className={styles.back} onClick={() => dialog.current?.close()}>Back to booking</button>
      </div>
    </dialog>
  </>;
}
