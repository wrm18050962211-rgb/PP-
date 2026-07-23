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
  fetchPriority?: 'high' | 'low' | 'auto';
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
  fetchPriority = 'auto',
  fallbackSrc,
  playLive = true,
}: LivePhotoMediaProps) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const live = isLiveMedia(media);
  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';
  const primaryImageSrc = media?.posterUrl || media?.url;
  const imageSrc = imageFailed ? undefined : primaryImageSrc;
  const videoSrc = live ? media?.videoUrl || (media?.contentType?.startsWith('video/') ? media.url : undefined) : undefined;
  const shouldPlayVideo = playLive && live && videoSrc && !videoFailed;
  const showFallback = Boolean(fallbackSrc && (!imageSrc || !imageLoaded));

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      {showFallback ? (
        <img
          className={`absolute inset-0 h-full w-full ${fitClass}`}
          src={fallbackSrc}
          alt=""
          aria-hidden="true"
          decoding="sync"
        />
      ) : null}
      {shouldPlayVideo ? (
        <video
          className={`relative h-full w-full ${fitClass} ${mediaClassName}`}
          src={videoSrc}
          poster={imageSrc && imageSrc !== videoSrc ? imageSrc : fallbackSrc}
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
          className={`relative h-full w-full ${fitClass} ${mediaClassName} transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          src={imageSrc}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          onLoad={() => setImageLoaded(true)}
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
