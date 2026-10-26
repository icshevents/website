import CommitteeSection from '@/components/CommitteeSection';
import {PageHero,CTA,Arrow} from '@/components/Shared';
import Link from 'next/link';
import Image from 'next/image';
import {site} from '@/lib/content';
import styles from './about.module.css';

export const metadata={title:'About Us',description:'Discover ICSH’s history since 1976, our purpose and the people we bring together across Harrow.',alternates:{canonical:'/about'}};

const photographs={
  friends:{tone:'friends',src:'/assets/about/about-friends.webp',alt:'Four community members standing together indoors',width:1200,height:900},
  picnic:{tone:'picnic',src:'/assets/about/about-picnic-games.webp',alt:'Community members enjoying an egg-and-spoon activity at a summer picnic',width:1200,height:900},
  lake:{tone:'lake',src:'/assets/about/about-lakeside.webp',alt:'Five community members beside a mountain lake',width:1200,height:900},
  visit:{tone:'visit',src:'/assets/about/about-cultural-visit.webp',alt:'A community group posing together inside an ornate historic building',width:1200,height:900},
  coast:{tone:'coast',src:'/assets/about/about-coastal-day.webp',alt:'Five community members together on a coastal sightseeing visit',width:900,height:1200},
  bus:{tone:'bus',src:'/assets/about/about-sightseeing.webp',alt:'Community members gathered beside a red sightseeing bus',width:1200,height:900},
};
type StoryPhoto=typeof photographs[keyof typeof photographs];
function StoryPhoto({photo}:{photo:StoryPhoto}){return <figure className="about-story-photo"><Image src={photo.src} alt={photo.alt} width={photo.width} height={photo.height} sizes="(max-width:650px) calc(100vw - 40px), (max-width:1000px) 48vw, 600px" loading="lazy" className={`about-photo-${photo.tone}`}/></figure>}

export default function About(){return <>
  <PageHero label="Our story" title={<>Community, culture.<br/>And the joy of connection.</>} description="A community shaped by the people who come together, and the friendships they take away."/>
  <section className="section white"><div className="wrap intro-grid"><div><div className="story-mark">{site.founded}<span>THE BEGINNING OF A SHARED STORY</span></div><h2>A welcoming space,<br/>across generations.</h2><p>Since 1976, ICSH has worked to create a welcoming environment for people from diverse backgrounds to enjoy each other’s company, strengthen bonds and contribute to the wellbeing of the community.</p><p>ICSH welcomes people from all backgrounds, creating opportunities for social interaction and community involvement. Friendship and meaningful shared moments are at the heart of what we do.</p></div><StoryPhoto photo={photographs.picnic}/></div></section>
  <section className="section"><div className="wrap"><div className="eyebrow">What brings us together</div><h2>Simple values. Shared purpose.</h2><div className="values">{[['Connection','Space for conversation, familiar faces and friendships waiting to happen.'],['Culture','Opportunities to gather around traditions and share experiences across generations.'],['Contribution','A community strengthened by volunteers and charitable giving.']].map(([t,d])=><div key={t}><h3>{t}</h3><p>{d}</p></div>)}</div></div></section>
  <section className="section white"><div className="wrap about-activities"><div><div className="eyebrow">Our activities</div><h2>Many ways<br/>to come together.</h2><p>ICSH’s programme includes community gatherings, cultural celebrations and lunches, food festivals, fundraising for local and national charities, summer picnics, sports outings and quiz nights.</p><p>Some events are free and some are paid. We publish confirmed dates and booking information in our events section.</p><Link href="/events" className="text-link">Explore our events <Arrow/></Link></div><StoryPhoto photo={photographs.friends}/></div></section>
  <section className="section"><div className="wrap"><div className="about-memories-heading"><div><div className="eyebrow">Life at ICSH</div><h2>Shared experiences.<br/>Lasting memories.</h2></div><p>From summer picnics to trips further afield, our community is built through the time we spend together.</p></div><div className="about-memory-columns"><div className="about-memory-column"><StoryPhoto photo={photographs.lake}/><StoryPhoto photo={photographs.visit}/></div><div className="about-memory-column"><StoryPhoto photo={photographs.coast}/><StoryPhoto photo={photographs.bus}/></div></div></div></section>
  <section className="section white"><div className={`wrap split ${styles.committeeIntro}`}><div className="eyebrow">People make it possible</div><h2>Volunteer-powered.<br/>Community-focused.</h2><div className={styles.committeeCopy}><p>Our Executive Committee serves voluntarily, giving time and resources to support the society’s activities and community mission.</p><p>{site.name} is a registered charity in England and Wales, number {site.charityNumber}.</p><Link href="#committee" className="text-link">Meet the Executive Committee <Arrow/></Link></div></div></section>
  <CommitteeSection/>
  <CTA/>
</>}
