import { useEffect, useState } from 'react';
import type { PostImage } from '../types/api';

type LivePhotoMediaProps = {
  media?: PostImage;
  alt: string;
  className?: string;
  mediaClassName?: string;
  fit?: 'cover' | 'contain';
  loading?: 'eager' | 'lazy';
  fallbackSrc?: string;
  showBadge?: boolean;
};

export function isLiveMedia(media?: Pick<PostImage, 'contentType' | 'mediaKind' | 'videoUrl'>) {
  return media?.mediaKind === 'live' || media?.mediaKind === 'video' || Boolean(media?.videoUrl) || Boolean(media?.contentType?.startsWith('video/'));
}

export function LivePhotoMedia({
  media,
  alt,
  className = '',
  mediaClassName = '',
  fit = 'cover',
  loading = 'lazy',
  fallbackSrc,
  showBadge = true,
}: LivePhotoMediaProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const live = isLiveMedia(media);
  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';
  const imageSrc = imageFailed ? fallbackSrc : media?.posterUrl || media?.url || fallbackSrc;
  const videoSrc = live ? media?.videoUrl || (media?.contentType?.startsWith('video/') ? media.url : undefined) : undefined;
  const shouldPlayVideo = live && videoSrc && !videoFailed;

  useEffect(() => {
    setVideoFailed(false);
    setImageFailed(false);
  }, [media?.id, media?.url, media?.videoUrl]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      {shouldPlayVideo ? (
        <video
          className={`h-full w-full ${fitClass} ${mediaClassName}`}
          src={videoSrc}
          poster={imageSrc && imageSrc !== videoSrc ? imageSrc : undefined}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          aria-label={alt}
          onError={() => setVideoFailed(true)}
        />
      ) : imageSrc ? (
        <img
          className={`h-full w-full ${fitClass} ${mediaClassName}`}
          src={imageSrc}
          alt={alt}
          loading={loading}
          onError={(event) => {
            if (fallbackSrc && event.currentTarget.src !== fallbackSrc) {
              setImageFailed(true);
            }
          }}
        />
      ) : null}
      {live && showBadge ? (
        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-[2px] bg-black/58 px-1.5 py-0.5 text-[9px] font-black leading-none tracking-[0.14em] text-white/90 backdrop-blur">
          LIVE
        </span>
      ) : null}
    </div>
  );
}
