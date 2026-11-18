import Link from 'next/link';
import type {HomeUpcomingEvent} from '@/lib/home-event-forms';
import styles from './HomeFeaturedEvents.module.css';

export default function HomeFeaturedEvents({events,available}:{events:HomeUpcomingEvent[];available:boolean}) {
  return <section id="whats-next" className={styles.section} aria-labelledby="featured-events-heading">
    <div className="wrap">
      <div className={styles.heading}>
        <h2 id="featured-events-heading">Coming up at ICSH</h2>
        <Link href="/events" className="text-link">Explore all events <span aria-hidden="true">↗</span></Link>
      </div>
      {events.length ? <ul className={styles.grid}>
        {events.map(event => {
          const mainLink = event.links.find(link => link.label === 'View event details') ?? event.links[0];
          return <li key={event.id} className={styles.card}>
            <article>
              <Link href={mainLink.href} className={styles.mainLink}>
                {event.image && <div className={styles.artwork}>
                  <img src={event.image} alt="" loading="lazy" decoding="async"/>
                </div>}
                <h3>{event.title}</h3>
              </Link>
              <p className={styles.date}><time dateTime={event.date}>{event.dateLabel}</time></p>
              <p className={styles.venue}>{event.venue}</p>
              {!event.image && <p className={styles.summary}>{event.summary}</p>}
              {event.links.filter(link => link.href !== mainLink.href).map(link =>
                <Link key={link.href} className={styles.action} href={link.href} aria-label={link.label+' — '+event.title}>
                  {link.label} <span aria-hidden="true">↗</span>
                </Link>
              )}
            </article>
          </li>;
        })}
      </ul> : <p>{available ? 'New events are on the way. Check back soon.' : 'Visit Events & Services for the latest events.'}</p>}
    </div>
  </section>;
}
