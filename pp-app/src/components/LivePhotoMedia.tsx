import { useState } from 'react';
import type { PostImage } from '../types/api';
import { isLiveMedia } from '../utils/media';

type LivePhotoMediaProps = {
  media?: PostImage;
  alt: string;
  className?: string;
  mediaClassName?: string;
  fit?: 'cover' | 'contain';
  loading?: 'eager' | 'lazy';
  fallbackSrc?: string;
  playLive?: boolean;
};

export function LivePhotoMedia(props: LivePhotoMediaProps) {
  const mediaKey = [
    props.media?.id,
    props.media?.url,
    props.media?.posterUrl,
    props.media?.videoUrl,
    props.fallbackSrc,
  ].join('|');

  return <LivePhotoMediaContent key={mediaKey} {...props} />;
}

function LivePhotoMediaContent({
  media,
  alt,
  className = '',
  mediaClassName = '',
  fit = 'cover',
  loading = 'lazy',
  fallbackSrc,
  playLive = true,
}: LivePhotoMediaProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const live = isLiveMedia(media);
  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';
  const imageSrc = imageFailed ? fallbackSrc : media?.posterUrl || media?.url || fallbackSrc;
  const videoSrc = live ? media?.videoUrl || (media?.contentType?.startsWith('video/') ? media.url : undefined) : undefined;
  const shouldPlayVideo = playLive && live && videoSrc && !videoFailed;

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
          decoding="async"
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
