import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FeedPost } from '../../types/api';

export type PhotoCardVariant = 'tall' | 'portrait' | 'soft' | 'wide';

const aspectByVariant: Record<PhotoCardVariant, string> = {
  tall: 'aspect-[0.74]',
  portrait: 'aspect-[0.82]',
  soft: 'aspect-[0.96]',
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
}: {
  post: FeedPost;
  priority?: boolean;
  variant?: PhotoCardVariant;
  className?: string;
}) {
  return (
    <article className={`overflow-hidden rounded-[2px] bg-[#161616] ring-1 ring-white/8 ${className}`}>
      <Link to={`/consumer/post/${post.id}`} className="block" aria-label={`查看${post.location}作品详情`}>
        <div className={`relative overflow-hidden bg-zinc-950 ${aspectByVariant[variant]}`}>
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
        </div>
        <div className="flex items-center justify-between gap-2 bg-[#161616] px-2.5 py-2">
          <span className="inline-flex min-w-0 items-center gap-1 text-[11px] font-semibold tracking-wide text-white/58">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{post.locationName || post.location}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums text-white/58">
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
