import type { MediaUploadPolicy, MediaUploadPurpose, PostImage } from '../types/api';
import { apiPost, getApiFallback, isApiEnabled, isMockFallbackAllowed } from './apiClient';
import { isMiniProgramRuntime, wxUploadFile } from './miniProgramBridge';

type UploadInput = {
  file: File;
  purpose: MediaUploadPurpose;
};

export async function uploadPostImage(file: File): Promise<PostImage> {
  const isVideo = file.type.startsWith('video/');
  const policy = await requestUploadPolicy(file, isVideo ? 'video' : 'post-image');
  if (policy?.mode === 'production') {
    await uploadWebFileToCos(policy, file);
    return {
      id: `cos-media-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: policy.publicUrl,
      mediaKind: isVideo ? 'live' : 'image',
      videoUrl: isVideo ? policy.publicUrl : undefined,
      provider: policy.provider,
      objectKey: policy.objectKey,
      contentType: policy.contentType,
      sizeBytes: file.size,
      sortOrder: 0,
    };
  }
  if (!isMockFallbackAllowed()) throw new Error('媒体上传需要先接入生产对象存储。');

  const localPreviewUrl = await readFileAsDataUrl(file);
  const mediaUrl = getApiFallback(localPreviewUrl, 'Media upload');

  return {
    id: `draft-image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    url: mediaUrl,
    mediaKind: isVideo ? 'live' : 'image',
    videoUrl: isVideo ? mediaUrl : undefined,
    provider: policy?.provider ?? 'local',
    objectKey: policy?.objectKey,
    contentType: file.type,
    sizeBytes: file.size,
    sortOrder: 0,
  };
}

export async function requestUploadPolicy(file: File, purpose: MediaUploadPurpose): Promise<MediaUploadPolicy | null> {
  if (!isApiEnabled()) return getApiFallback(null, 'Upload policy');

  try {
    const response = await apiPost<MediaUploadPolicy>('/api/media/upload-policy', {
      purpose,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    });
    return response.success ? response.data : getApiFallback(null, 'Upload policy');
  } catch {
    return getApiFallback(null, 'Upload policy');
  }
}

export async function uploadMediaFile({ file, purpose }: UploadInput): Promise<string> {
  const policy = await requestUploadPolicy(file, purpose);
  if (policy?.mode === 'production') {
    await uploadWebFileToCos(policy, file);
    return policy.publicUrl;
  }
  if (!isMockFallbackAllowed()) throw new Error('媒体上传需要先接入生产对象存储。');
  return getApiFallback(await readFileAsDataUrl(file), 'Media upload');
}

export async function uploadMiniProgramMediaFile(filePath: string, purpose: MediaUploadPurpose, fileName = 'upload.jpg'): Promise<string> {
  const policy = await requestMiniProgramUploadPolicy(fileName, purpose);
  if (!policy) return getApiFallback(filePath, 'Mini program media upload');
  if (policy.mode === 'production') {
    if (!isMiniProgramRuntime()) throw new Error('Mini program upload is not available outside WeChat.');
    if (!policy.formFields) throw new Error('COS upload policy is incomplete.');
    await wxUploadFile(policy.uploadUrl, filePath, policy.formFields);
  }
  return policy.publicUrl;
}

async function requestMiniProgramUploadPolicy(fileName: string, purpose: MediaUploadPurpose): Promise<MediaUploadPolicy | null> {
  if (!isApiEnabled()) return getApiFallback(null, 'Mini program upload policy');

  try {
    const response = await apiPost<MediaUploadPolicy>('/api/media/upload-policy', {
      purpose,
      fileName,
      contentType: inferContentType(fileName),
    });
    return response.success ? response.data : getApiFallback(null, 'Mini program upload policy');
  } catch {
    return getApiFallback(null, 'Mini program upload policy');
  }
}

async function uploadWebFileToCos(policy: MediaUploadPolicy, file: File): Promise<void> {
  if (policy.uploadMethod !== 'POST' || !policy.formFields) {
    throw new Error('COS upload policy is incomplete.');
  }

  const formData = new FormData();
  Object.entries(policy.formFields).forEach(([key, value]) => formData.append(key, value));
  formData.append('file', file);
  const response = await fetch(policy.uploadUrl, { method: 'POST', body: formData });
  if (!response.ok) throw new Error(`COS upload failed with status ${response.status}.`);
}

function inferContentType(fileName: string) {
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  const byExtension: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  };
  return byExtension[extension || ''] || 'application/octet-stream';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
