export function getFeedImageUrl(src: string, width: number, quality = 72) {
  try {
    const url = new URL(src);
    if (url.hostname !== 'images.unsplash.com') return src;

    url.searchParams.set('auto', 'format');
    url.searchParams.set('fit', 'crop');
    url.searchParams.set('w', String(width));
    url.searchParams.set('q', String(quality));
    return url.toString();
  } catch {
    return src;
  }
}

