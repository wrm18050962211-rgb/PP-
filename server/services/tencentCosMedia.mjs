import { createHash, createHmac } from 'node:crypto';
import STS from 'qcloud-cos-sts';

const defaultCredentialDurationSeconds = 900;

export function hasTencentCosMediaConfig(env = process.env) {
  return Boolean(
    env.TENCENT_CLOUD_SECRET_ID &&
      env.TENCENT_CLOUD_SECRET_KEY &&
      env.COS_BUCKET &&
      env.COS_REGION &&
      env.COS_PUBLIC_BASE_URL,
  );
}

export async function createTencentCosPostUploadPolicy({
  objectKey,
  contentType,
  maxSizeBytes,
  env = process.env,
  now = Date.now(),
  credentialProvider = getTemporaryCredential,
}) {
  const config = readTencentCosConfig(env);
  validateUploadPolicyInput({ objectKey, contentType, maxSizeBytes });
  const appId = parseBucketAppId(config.bucket);
  const resource = `qcs::cos:${config.region}:uid/${appId}:${config.bucket}/${objectKey}`;
  const temporaryCredential = await credentialProvider({
    secretId: config.secretId,
    secretKey: config.secretKey,
    region: config.region,
    durationSeconds: defaultCredentialDurationSeconds,
    policy: {
      version: '2.0',
      statement: [
        {
          action: ['name/cos:PostObject'],
          effect: 'allow',
          resource: [resource],
        },
      ],
    },
  });

  const startTime = Math.max(Number(temporaryCredential.startTime) || Math.floor(now / 1000) - 60, Math.floor(now / 1000) - 60);
  const expiredTime = Number(temporaryCredential.expiredTime) || startTime + defaultCredentialDurationSeconds;
  const keyTime = `${startTime};${expiredTime}`;
  const algorithm = 'sha1';
  const credentials = temporaryCredential.credentials;
  const policy = JSON.stringify({
    expiration: new Date(expiredTime * 1000).toISOString(),
    conditions: [
      { 'q-sign-algorithm': algorithm },
      { 'q-ak': credentials.tmpSecretId },
      { 'q-sign-time': keyTime },
      { bucket: config.bucket },
      { key: objectKey },
      ['eq', '$Content-Type', contentType],
      ['content-length-range', 1, maxSizeBytes],
    ],
  });
  const signKey = createHmac('sha1', credentials.tmpSecretKey).update(keyTime).digest('hex');
  const stringToSign = createHash('sha1').update(policy).digest('hex');
  const signature = createHmac('sha1', signKey).update(stringToSign).digest('hex');

  return {
    provider: 'tencent_cos',
    mode: 'production',
    bucket: config.bucket,
    region: config.region,
    objectKey,
    contentType,
    uploadMethod: 'POST',
    uploadUrl: `https://${config.bucket}.cos.${config.region}.myqcloud.com`,
    publicUrl: `${config.publicBaseUrl}/${encodeObjectKey(objectKey)}`,
    expiresAt: new Date(expiredTime * 1000).toISOString(),
    formFields: {
      key: objectKey,
      policy: Buffer.from(policy).toString('base64'),
      'q-sign-algorithm': algorithm,
      'q-ak': credentials.tmpSecretId,
      'q-key-time': keyTime,
      'q-signature': signature,
      'x-cos-security-token': credentials.sessionToken,
      'Content-Type': contentType,
    },
  };
}

export function readTencentCosConfig(env = process.env) {
  const required = [
    'TENCENT_CLOUD_SECRET_ID',
    'TENCENT_CLOUD_SECRET_KEY',
    'COS_BUCKET',
    'COS_REGION',
    'COS_PUBLIC_BASE_URL',
  ];
  const missing = required.filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Tencent COS media config is missing: ${missing.join(', ')}`);

  const publicBaseUrl = String(env.COS_PUBLIC_BASE_URL).replace(/\/+$/, '');
  const publicBase = new URL(publicBaseUrl);
  if (publicBase.protocol !== 'https:' || publicBase.username || publicBase.password) {
    throw new Error('COS_PUBLIC_BASE_URL must be an HTTPS URL without embedded credentials.');
  }
  if (!/^[a-z0-9-]+$/i.test(env.COS_REGION)) {
    throw new Error('COS_REGION contains unsupported characters.');
  }
  parseBucketAppId(env.COS_BUCKET);

  return {
    secretId: env.TENCENT_CLOUD_SECRET_ID,
    secretKey: env.TENCENT_CLOUD_SECRET_KEY,
    bucket: env.COS_BUCKET,
    region: env.COS_REGION,
    publicBaseUrl,
  };
}

function validateUploadPolicyInput({ objectKey, contentType, maxSizeBytes }) {
  if (!/^pp\/public\/[a-z0-9-]+\/[a-z0-9-]+\/[0-9]{4}-[0-9]{2}\/[a-z0-9-]+\.[a-z0-9]+$/i.test(String(objectKey))) {
    throw new Error('COS media object key must target one exact pp/public asset path.');
  }
  if (!/^(image|video)\/[a-z0-9.+-]+$/i.test(String(contentType))) {
    throw new Error('COS media content type is invalid.');
  }
  if (!Number.isSafeInteger(maxSizeBytes) || maxSizeBytes <= 0) {
    throw new Error('COS media maximum size must be a positive integer.');
  }
}

export function parseBucketAppId(bucket) {
  const match = String(bucket).match(/-(\d+)$/);
  if (!match) throw new Error('COS_BUCKET must include the Tencent Cloud APPID suffix.');
  return match[1];
}

function getTemporaryCredential(options) {
  return new Promise((resolve, reject) => {
    STS.getCredential(
      options,
      (error, credential) => {
        if (error) {
          reject(new Error(`Tencent COS temporary credential request failed: ${error.message || 'unknown error'}`));
          return;
        }
        if (!credential?.credentials?.tmpSecretId || !credential.credentials.tmpSecretKey || !credential.credentials.sessionToken) {
          reject(new Error('Tencent COS temporary credential response is incomplete.'));
          return;
        }
        resolve(credential);
      },
    );
  });
}

function encodeObjectKey(objectKey) {
  return String(objectKey)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}
