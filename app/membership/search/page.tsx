import Link from 'next/link';
import MemberSearch from '@/components/MemberSearch';

export const metadata = { title: 'Member Search', description: 'Look up your ICSH membership dates using your name, email address or mobile number.', robots: { index: false, follow: false } };

export default function MemberSearchPage() {
  return <section className="section white"><div className="wrap" style={{ maxWidth: 760 }}>
    <Link href="/membership" className="text-link" style={{ marginBottom: 32 }}>← Back to membership</Link>
    <div className="eyebrow">Member Search Tool</div><h1 style={{ fontSize: 'clamp(36px,6vw,54px)', marginBottom: 16 }}>Your membership,<br/>at a glance.</h1>
    <p style={{ color: 'var(--muted)', marginBottom: 32 }}>Find your membership start date, expiry date and approximate days remaining.</p>
    <div className="panel" style={{ padding: 'clamp(22px,5vw,40px)' }}><MemberSearch/></div>
  </div></section>;
}
