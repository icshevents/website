import Link from 'next/link';
import styles from './BlackFridayBanner.module.css';

// Keep this aligned with the ICSH10 checkout cutoff. The UK is on GMT in December.
export const blackFridayEndsAt = '2026-12-08T23:59:00Z';

export default function BlackFridayBanner() {
 return (
  <section className={`wrap ${styles.banner}`} aria-labelledby="black-friday-title">
   <div className={styles.artwork}>
    <h1 id="black-friday-title" className={styles.title}>
     <span>Black</span>
     <span>Friday</span>
     <em className={styles.sale}>Sale</em>
    </h1>
   </div>
   <div className={styles.offer}>
    <p className={styles.eligibility}>Exclusive to active ICSH members</p>
    <p className={styles.savings}>10% off</p>
    <p className={styles.events}>Winter Lunch and Ramadan Iftari</p>
    <div className={styles.checkout}>
     <p>Use code <strong className={styles.code}>ICSH10</strong> when booking.</p>
     <p>Ends <time dateTime={blackFridayEndsAt}>8 December 2026 at 11:59 pm UK time</time>.</p>
    </div>
    <div className={styles.actions}>
     <Link className={styles.join} href="/membership?category=new#join">Become a member</Link>
     <Link className={styles.eventsLink} href="/events">View events</Link>
    </div>
   </div>
  </section>
 );
}
