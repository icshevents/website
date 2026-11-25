import Link from 'next/link';
import styles from './BlackFridayBanner.module.css';

// Keep this aligned with the ICSH10 checkout cutoff. The UK is on GMT in December.
const blackFridayEndsAt = '2026-12-08T23:59:00Z';

export function isBlackFridayOfferActive() {
 return Date.now() < Date.parse(blackFridayEndsAt);
}

export default function BlackFridayBanner({compact = false}: {compact?: boolean}) {
 const Heading = compact ? 'h2' : 'h1';
 return (
  <section className={`${styles.banner} ${compact ? styles.compact : 'wrap'}`} aria-labelledby="black-friday-title">
   <div className={styles.artwork}>
    <Heading id="black-friday-title" className={styles.title}>
     <span>Black</span>
     <span>Friday</span>
     <em className={styles.sale}>Sale</em>
    </Heading>
   </div>
   <div className={styles.offer}>
    <p className={styles.eligibility}>Exclusive to active ICSH members</p>
    <div className={styles.offerHeadline}>
     <p className={styles.savings}>10% off</p>
     <p className={styles.events}>Winter Lunch and{' '}{!compact && <br className={styles.mobileBreak}/>}Ramadan Iftari</p>
    </div>
    <div className={styles.checkout}>
     <p>Use code <strong className={styles.code}>ICSH10</strong> when booking.</p>
     <p className={styles.deadline}>
      Ends <time dateTime={blackFridayEndsAt}>8 December 2026</time> or when event places fill up,{compact ? ' ' : <br/>}
      whichever comes first.
     </p>
    </div>
    <div className={styles.actions}>
     <Link className={styles.join} href="/membership?category=new#join">Become a member</Link>
     {!compact && <Link className={styles.eventsLink} href="/events">View events</Link>}
    </div>
   </div>
  </section>
 );
}
