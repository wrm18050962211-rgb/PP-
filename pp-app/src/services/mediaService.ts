import type { MediaUploadPolicy, MediaUploadPurpose, PostImage } from '../types/api';
import { apiPost, isApiEnabled } from './apiClient';

type UploadInput = {
  file: File;
  purpose: MediaUploadPurpose;
};

export async function uploadPostImage(file: File): Promise<PostImage> {
  const policy = await requestUploadPolicy(file, 'post-image');
  const localPreviewUrl = await readFileAsDataUrl(file);

  return {
    id: `draft-image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url: policy?.mode === 'production' ? policy.publicUrl : localPreviewUrl,
    provider: policy?.provider ?? 'local',
    objectKey: policy?.objectKey,
    contentType: file.type,
    sizeBytes: file.size,
    sortOrder: 0,
  };
}

export async function requestUploadPolicy(file: File, purpose: MediaUploadPurpose): Promise<MediaUploadPolicy | null> {
  if (!isApiEnabled()) return null;

  try {
    const response = await apiPost<MediaUploadPolicy>('/api/media/upload-policy', {
      purpose,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    });
    return response.success ? response.data : null;
  } catch {
    return null;
  }
}

export async function uploadMediaFile({ file, purpose }: UploadInput): Promise<string> {
  const policy = await requestUploadPolicy(file, purpose);
  if (policy?.mode === 'production') return policy.publicUrl;
  return readFileAsDataUrl(file);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
