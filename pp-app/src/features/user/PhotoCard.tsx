import { Heart, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isLiveMedia, LivePhotoMedia } from '../../components/LivePhotoMedia';
import { listFeedPosts } from '../../services/feedService';
import { getPostLikeCount } from '../../services/userCollectionService';
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
  postHref,
  playLive = false,
}: {
  post: FeedPost;
  priority?: boolean;
  variant?: PhotoCardVariant;
  className?: string;
  postHref?: string;
  playLive?: boolean;
}) {
  const likeCount = getPostLikeCount(post.id, listFeedPosts());
  const href = postHref ?? `/consumer/post/${post.id}`;
  const cover = post.images[0];
  const liveCover = isLiveMedia(cover);

  return (
    <article className={`overflow-hidden bg-[#050505] ${className}`} data-feed-live-card={liveCover ? '1' : undefined} data-feed-post-id={post.id}>
      <Link to={href} className="block" aria-label={`查看${post.location}作品详情`}>
        <div className={`relative overflow-hidden bg-zinc-950 ${aspectByVariant[variant]}`}>
          <LivePhotoMedia
            media={cover}
            alt={post.location}
            loading={priority ? 'eager' : 'lazy'}
            fallbackSrc={getFallbackImage(post.id, variant)}
            playLive={playLive && liveCover}
            mediaClassName="brightness-[0.94] contrast-[1.14] saturate-[0.98] transition duration-500 active:scale-[1.03]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/72 via-black/18 to-transparent px-1.5 pb-1.5 pt-7">
            <span className="inline-flex min-w-0 items-center gap-0.5 text-[9px] font-semibold tracking-wide text-white/72 drop-shadow">
              <MapPin size={9} className="shrink-0" />
              <span className="truncate">{post.locationName || post.location}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[9px] font-semibold tabular-nums text-white/72 drop-shadow">
              <Heart size={9} fill="currentColor" />
              {formatSocialCount(likeCount)}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function getFallbackImage(seed: string, variant: PhotoCardVariant) {
  const palette = fallbackPalettes[getPaletteSeed(seed) % fallbackPalettes.length];
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

function getPaletteSeed(seed: string) {
  const score = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 128 + (score % 8700);
}

function formatSocialCount(count: number) {
  return String(count);
}
