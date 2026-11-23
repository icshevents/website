import type {MetadataRoute} from 'next';
import {canonicalOrigin,membershipIndexingEnabled} from '@/lib/content';

export default function robots(): MetadataRoute.Robots {
  if (membershipIndexingEnabled) return {rules:{userAgent:'*',allow:'/'},sitemap:canonicalOrigin+'/sitemap.xml'};

  return {rules:[
    {userAgent:['facebookexternalhit','Facebot'],allow:'/'},
    {userAgent:'*',disallow:'/'},
  ]};
}
