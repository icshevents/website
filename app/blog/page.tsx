import {PageHero,PostCard,CTA} from '@/components/Shared';
import {posts} from '@/lib/content';
export const metadata={title:'Blogs',description:'Community blogs, shared adventures and photographs from ICSH, Society of Harrow.',alternates:{canonical:'/blog'}};
export default function Blog(){return <><PageHero label="Blogs" title={<>Shared moments.<br/>Stories worth keeping.</>} description="Community news, memorable journeys and the experiences that bring us closer together."/><section className="section white"><div className="wrap"><div className="blog-grid">{posts().map(p=><PostCard post={p} key={p.slug}/>)}</div></div></section><CTA/></>}
