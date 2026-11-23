import type { MetadataRoute } from 'next';
import { canonicalOrigin, launched, membershipIndexingEnabled, posts } from '@/lib/content';

export default function sitemap(): MetadataRoute.Sitemap {
 if (!launched) {
  return membershipIndexingEnabled ? [{url: canonicalOrigin + '/membership'}] : [];
 }

 return [
  '', '/about', '/membership', '/events', '/blog', '/rishta-service',
  '/participate', '/donate', '/contact', '/privacy', ...posts().map(post => '/blog/' + post.slug),
 ].map(path => ({url: canonicalOrigin + path, changeFrequency: 'monthly', priority: path === '' ? 1 : .7}));
}
