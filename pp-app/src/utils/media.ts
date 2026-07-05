import type { PostImage } from '../types/api';

export function isLiveMedia(media?: Pick<PostImage, 'contentType' | 'mediaKind' | 'videoUrl'>) {
  return media?.mediaKind === 'live' || media?.mediaKind === 'video' || Boolean(media?.videoUrl) || Boolean(media?.contentType?.startsWith('video/'));
}
