import Link from 'next/link';
import './workspace.css';
import WorkspaceNotifications from '@/components/organiser/WorkspaceNotifications';
export const metadata = { title: 'Organiser workspace', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: React.ReactNode }) { return <div className="organiser-workspace"><div className="workspace-context" aria-label="Organiser workspace identification"><div className="workspace-context-inner"><div className="workspace-context-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><div>ICSH Organiser Workspace<small>Private team portal · Admin &amp; Events hubs</small></div></div><Link href="/">View public website ↗</Link></div></div><WorkspaceNotifications/>{children}</div>; }
