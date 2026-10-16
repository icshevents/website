import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { remark } from 'remark';
import html from 'remark-html';
import siteData from '@/content/site.json';
export const site = siteData;
export type Post = { slug:string; title:string; date:string; author:string; excerpt:string; image:string; imageAlt:string; gallery?:string; body:string };
export function posts(): Post[] { const dir=path.join(process.cwd(),'content/posts'); return fs.readdirSync(dir).filter(f=>f.endsWith('.md')).map(f=>{const {data,content}=matter(fs.readFileSync(path.join(dir,f),'utf8')); for(const k of ['title','date','excerpt','image','imageAlt']) { if(typeof data[k] !== 'string') throw new Error(`${f}: missing ${k}`); } return {...data,author:data.author||site.shortName,slug:f.replace(/\.md$/,''),body:content} as Post;}).sort((a,b)=>b.date.localeCompare(a.date)); }
export async function postHtml(post:Post) { return String(await remark().use(html, {sanitize:true}).process(post.body)); }
export function displayDate(value:string) { return new Date(value+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/London'}); }
export const canonicalOrigin = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.icsh.org.uk';
export const launched = process.env.SITE_LAUNCHED === 'true' && process.env.VERCEL_ENV !== 'preview';
