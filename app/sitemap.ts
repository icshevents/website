import type {MetadataRoute} from 'next';
import {posts,canonicalOrigin} from '@/lib/content';
import albums from '@/content/galleries.json';
export default function sitemap():MetadataRoute.Sitemap{return ['','/about','/membership','/events','/blog','/gallery','/committee','/contact','/privacy',...posts().map(p=>'/blog/'+p.slug),...albums.map(a=>'/gallery/'+a.slug)].map(p=>({url:canonicalOrigin+p,changeFrequency:'monthly',priority:p===''?1:.7}))}
