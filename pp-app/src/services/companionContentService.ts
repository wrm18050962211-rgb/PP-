import type { PublishedWorkDraft } from '../types/api';
import { apiPost, isApiEnabled } from './apiClient';

type CompanionPostResult = {
  id: string;
  status: 'draft' | 'pending_review';
  isFeedVisible: boolean;
};

export async function publishCompanionWork(work: PublishedWorkDraft, city?: string): Promise<CompanionPostResult> {
  if (!isApiEnabled()) throw new Error('Companion post API is not configured.');
  if (work.serverPostId) {
    return submitCompanionPostReview(work.serverPostId);
  }

  const created = await apiPost<CompanionPostResult>('/api/companion/posts', {
    city: city?.trim() || inferCity(work.location),
    locationName: work.location,
    timeLabel: work.timeLabel,
    caption: work.caption,
    activityName: work.activity,
    tags: work.tags,
    images: work.images.map((image) => ({
      url: image.url,
      objectKey: image.objectKey,
      width: image.width,
      height: image.height,
      sortOrder: image.sortOrder,
    })),
  });
  if (!created.success) {
    throw new Error(created.error?.message || 'Companion post creation failed.');
  }
  return submitCompanionPostReview(created.data.id);
}

async function submitCompanionPostReview(postId: string): Promise<CompanionPostResult> {
  const response = await apiPost<CompanionPostResult>(`/api/companion/posts/${encodeURIComponent(postId)}/submit-review`);
  if (!response.success) {
    throw new Error(response.error?.message || 'Companion post review submission failed.');
  }
  return response.data;
}

function inferCity(location: string) {
  return location
    .split(/[·\-|]/)
    .map((part) => part.trim())
    .find(Boolean) || '未指定';
}
