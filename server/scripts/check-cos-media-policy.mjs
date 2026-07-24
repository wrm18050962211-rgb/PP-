import assert from 'node:assert/strict';
import {
  createTencentCosPostUploadPolicy,
  hasTencentCosMediaConfig,
  parseBucketAppId,
  readTencentCosConfig,
} from '../services/tencentCosMedia.mjs';

const env = {
  TENCENT_CLOUD_SECRET_ID: 'server-secret-id',
  TENCENT_CLOUD_SECRET_KEY: 'server-secret-key',
  COS_BUCKET: 'still-media-staging-1250000000',
  COS_REGION: 'ap-shanghai',
  COS_PUBLIC_BASE_URL: 'https://media.example.com/',
};
const calls = [];

assert.equal(hasTencentCosMediaConfig(env), true);
assert.equal(hasTencentCosMediaConfig({ ...env, TENCENT_CLOUD_SECRET_KEY: '' }), false);
assert.equal(parseBucketAppId(env.COS_BUCKET), '1250000000');
assert.throws(() => parseBucketAppId('missing-appid'), /APPID suffix/);
assert.equal(readTencentCosConfig(env).publicBaseUrl, 'https://media.example.com');

const uploadPolicy = await createTencentCosPostUploadPolicy({
  env,
  objectKey: 'pp/public/avatar/user-1/2026-07/example image.jpg',
  contentType: 'image/jpeg',
  maxSizeBytes: 10 * 1024 * 1024,
  now: Date.UTC(2026, 6, 24, 0, 0, 0),
  credentialProvider: async (input) => {
    calls.push(input);
    return {
      startTime: 1784851200,
      expiredTime: 1784851800,
      credentials: {
        tmpSecretId: 'temporary-secret-id',
        tmpSecretKey: 'temporary-secret-key',
        sessionToken: 'temporary-session-token',
      },
    };
  },
});

assert.equal(calls.length, 1);
assert.deepEqual(calls[0].policy.statement[0].action, ['name/cos:PostObject']);
assert.deepEqual(calls[0].policy.statement[0].resource, [
  'qcs::cos:ap-shanghai:uid/1250000000:still-media-staging-1250000000/pp/public/avatar/user-1/2026-07/example image.jpg',
]);
assert.equal(uploadPolicy.mode, 'production');
assert.equal(uploadPolicy.uploadMethod, 'POST');
assert.equal(uploadPolicy.uploadUrl, 'https://still-media-staging-1250000000.cos.ap-shanghai.myqcloud.com');
assert.equal(
  uploadPolicy.publicUrl,
  'https://media.example.com/pp/public/avatar/user-1/2026-07/example%20image.jpg',
);
assert.equal(uploadPolicy.formFields.key, uploadPolicy.objectKey);
assert.equal(uploadPolicy.formFields['Content-Type'], 'image/jpeg');
assert.equal(uploadPolicy.formFields['x-cos-security-token'], 'temporary-session-token');
assert.match(uploadPolicy.formFields['q-signature'], /^[a-f0-9]{40}$/);
assert.equal(JSON.stringify(uploadPolicy).includes(env.TENCENT_CLOUD_SECRET_KEY), false);

const decodedPolicy = JSON.parse(Buffer.from(uploadPolicy.formFields.policy, 'base64').toString('utf8'));
assert.deepEqual(decodedPolicy.conditions.at(-2), ['eq', '$Content-Type', 'image/jpeg']);
assert.deepEqual(decodedPolicy.conditions.at(-1), ['content-length-range', 1, 10 * 1024 * 1024]);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'complete-config',
        'bucket-appid',
        'least-privilege-resource',
        'short-lived-post-policy',
        'content-type-and-size-limits',
        'public-url-encoding',
        'permanent-secret-not-returned',
      ],
    },
    null,
    2,
  ),
);
