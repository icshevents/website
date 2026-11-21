'use client';

import Image from 'next/image';
import {useState} from 'react';

export default function CoverPhoto({
 src, alt, priority = false,
}: {
 src?: string;
 alt: string;
 priority?: boolean;
}) {
 const [failedSource, setFailedSource] = useState<string>();
 if (!src || src === failedSource) {
  return <div className="cover-photo-placeholder" aria-hidden="true"><span>ICSH</span></div>;
 }

 return <Image
  src={src}
  alt={alt}
  width={1200}
  height={900}
  sizes="(max-width:650px) 100vw, (max-width:1000px) 50vw, 600px"
  priority={priority}
  unoptimized={src.startsWith('/api/events-image/')}
  onError={() => setFailedSource(src)}
 />;
}
