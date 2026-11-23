import 'server-only';
import {cache} from 'react';
import events from '@/content/events.json';
import {posts} from '@/lib/content';
import {publicPastEvents} from '@/lib/events-hub/server';

export const postsWithEventCovers = cache(async () => {
 const pastEvents = await publicPastEvents().catch(() => null);
 const covers = new Map<string, {image: string; imageAlt: string}>();

 for (const event of pastEvents ?? []) {
  if (event.sourceType !== 'archive' || !event.content.image?.startsWith('/api/events-image/')) continue;
  const story = events.find(entry => entry.id === event.sourceKey)?.blogSlug;
  if (story) {
   covers.set(story, {
    image: event.content.image,
    imageAlt: `${event.content.title} event photo`,
   });
  }
 }

 return posts().map(post => ({...post, ...covers.get(post.slug)}));
});
