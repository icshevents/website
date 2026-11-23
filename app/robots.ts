import type {MetadataRoute} from 'next';
import {launched,canonicalOrigin,membershipIndexingEnabled} from '@/lib/content';

export default function robots(): MetadataRoute.Robots {
  if (launched) return {rules:{userAgent:'*',allow:'/'},sitemap:canonicalOrigin+'/sitemap.xml'};

  // Let crawlers read the production pages' indexing directives. The public
  // membership page opts into indexing and the other pages retain noindex.
  if (membershipIndexingEnabled) return {rules:{userAgent:'*',allow:'/'}};

  return {rules:[
    {userAgent:['facebookexternalhit','Facebot'],allow:'/'},
    {userAgent:'*',disallow:'/'},
  ]};
}
