import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FeedPost } from '../../types/api';

export type PhotoCardVariant = 'tall' | 'portrait' | 'soft' | 'wide';

const aspectByVariant: Record<PhotoCardVariant, string> = {
  tall: 'aspect-[0.66]',
  portrait: 'aspect-[0.78]',
  soft: 'aspect-[0.92]',
  wide: 'aspect-[1.72]',
};

const fallbackPalettes = [
  ['#111111', '#56514b', '#f3ede6'],
  ['#0d0d0f', '#414a5a', '#d9ecff'],
  ['#14110f', '#6d4c3d', '#ffe0c8'],
  ['#0b1210', '#3a5c4d', '#e3f5ea'],
];

export function PhotoCard({
  post,
  priority = false,
  variant = 'portrait',
  className = '',
  fill = false,
}: {
  post: FeedPost;
  priority?: boolean;
  variant?: PhotoCardVariant;
  className?: string;
  fill?: boolean;
}) {
  return (
    <article className={`relative overflow-hidden rounded-[2px] bg-zinc-950 ring-1 ring-white/8 ${fill ? 'h-full' : aspectByVariant[variant]} ${className}`}>
      <Link to={`/consumer/post/${post.id}`} className="block h-full w-full" aria-label={`查看${post.location}作品详情`}>
        <img
          className="h-full w-full object-cover saturate-[0.82] contrast-[1.06] transition duration-500 active:scale-[1.025]"
          src={post.images[0]?.url}
          alt={post.location}
          loading={priority ? 'eager' : 'lazy'}
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = getFallbackImage(post.id, variant);
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/62 via-black/18 to-transparent px-2.5 pb-2.5 pt-14">
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold tracking-wide text-white/74">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{post.locationName || post.location}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums text-white/74">
            <Heart size={11} fill="currentColor" />
            {formatLikeCount(getLikeCount(post.id))}
          </span>
        </div>
      </Link>
    </article>
  );
}

function getFallbackImage(seed: string, variant: PhotoCardVariant) {
  const palette = fallbackPalettes[getLikeCount(seed) % fallbackPalettes.length];
  const wide = variant === 'wide';
  const width = wide ? 1200 : 720;
  const height = wide ? 700 : 980;
  const label = wide ? 'PP EDITORIAL' : 'PP PHOTO';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${palette[0]}"/>
          <stop offset="55%" stop-color="${palette[1]}"/>
          <stop offset="100%" stop-color="${palette[2]}"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <circle cx="${wide ? 930 : 520}" cy="${wide ? 160 : 210}" r="${wide ? 170 : 130}" fill="rgba(255,255,255,0.16)"/>
      <rect x="${wide ? 70 : 54}" y="${wide ? 470 : 740}" width="${wide ? 500 : 360}" height="4" fill="rgba(255,255,255,0.5)"/>
      <text x="${wide ? 70 : 54}" y="${wide ? 535 : 805}" fill="rgba(255,255,255,0.84)" font-family="Arial, sans-serif" font-size="${wide ? 54 : 42}" font-weight="800" letter-spacing="4">${label}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getLikeCount(seed: string) {
  const score = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 128 + (score % 8700);
}

function formatLikeCount(count: number) {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count);
}
