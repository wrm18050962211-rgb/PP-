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
    </div>
  );
}
