import Link from 'next/link';
export default function FormLinks({forms}:{forms?:{title:string;url:string}[]}){return forms?.length?<div className="panel"><h3>Event forms</h3><div className="actions">{forms.map(form=><Link className="button outline" key={form.url} href={form.url}>{form.title} ↗</Link>)}</div></div>:null;}
