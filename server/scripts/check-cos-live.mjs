import { createTencentCosPostUploadPolicy } from '../services/tencentCosMedia.mjs';

const policy = await createTencentCosPostUploadPolicy({
  objectKey: `pp/private/deploy-check-${Date.now()}.txt`,
  contentType: 'text/plain',
  maxSizeBytes: 1024,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      provider: policy.provider,
      mode: policy.mode,
      bucket: policy.bucket,
      region: policy.region,
      expiresAt: policy.expiresAt,
    },
    null,
    2,
  ),
);
