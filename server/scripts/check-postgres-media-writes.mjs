import { createPostgresStore } from '../store/postgresStore.mjs';

const ownerUserId = '00000000-0000-4000-8000-000000000901';
const assetId = '00000000-0000-4000-8000-000000000902';
const pool = createMockPool();
const store = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => pool,
});

assert(store.capabilities.mediaWrites === true, 'postgres store advertises media writes');
assert(typeof store.mediaWrites.createPending === 'function', 'postgres store exposes media create gateway');
assert(typeof store.mediaWrites.complete === 'function', 'postgres store exposes media completion gateway');
assert(typeof store.mediaWrites.delete === 'function', 'postgres store exposes media deletion gateway');

const pending = await store.mediaWrites.createPending({
  assetId,
  ownerUserId,
  provider: 'tencent_cos',
  bucket: 'pp-production-1250000000',
  region: 'ap-shanghai',
  objectKey: `pp/public/post-image/${ownerUserId}/2026-08/${assetId}.jpg`,
  publicUrl: `https://media.example.test/${assetId}.jpg`,
  purpose: 'post-image',
  visibility: 'public',
  contentType: 'image/jpeg',
  fileExtension: 'jpg',
  declaredSizeBytes: 1024,
  maxSizeBytes: 20 * 1024 * 1024,
  expiresAt: '2026-08-03T10:15:00.000Z',
  createdAt: '2026-08-03T10:00:00.000Z',
});
assert(pending.status === 'pending_upload', 'media gateway creates a pending asset');

const createClient = pool.clients[0];
assert(createClient.calls[0].sql === 'begin', 'pending asset creation begins a transaction');
assert(createClient.calls.some((call) => /insert into media_assets/i.test(call.sql)), 'pending asset metadata is inserted');
assert(createClient.calls.some((call) => /insert into media_asset_events/i.test(call.sql)), 'pending asset event is inserted');
assert(createClient.calls.at(-1).sql === 'commit', 'pending asset creation commits');
assert(createClient.released === true, 'pending asset client is released');

const completed = await store.mediaWrites.complete({
  assetId,
  ownerUserId,
  sizeBytes: 1024,
  width: 1080,
  height: 1440,
  completedAt: '2026-08-03T10:01:00.000Z',
});
assert(completed.status === 'uploaded', 'matching upload metadata completes the asset');
assert(completed.asset.sizeBytes === 1024, 'completed size is persisted');
const completeClient = pool.clients[1];
assert(completeClient.calls.some((call) => /for update/i.test(call.sql)), 'completion locks the owned asset');
assert(completeClient.calls.some((call) => /status = 'uploaded'/i.test(call.sql)), 'completion persists uploaded state');
assert(completeClient.calls.some((call) => /CLIENT_UPLOAD_CONFIRMED/.test(JSON.stringify(call.params))), 'completion writes a stable lifecycle reason');

const deleted = await store.mediaWrites.delete({
  assetId,
  ownerUserId,
  deletedAt: '2026-08-03T10:02:00.000Z',
});
assert(deleted.status === 'deleted', 'owner can tombstone the media asset');
const deleteClient = pool.clients[2];
assert(deleteClient.calls.some((call) => /to_status, reason_code/i.test(call.sql)), 'deletion appends a lifecycle event');

const rejectedPool = createMockPool();
rejectedPool.asset = createPendingRow();
const rejectedStore = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => rejectedPool,
});
const rejected = await rejectedStore.mediaWrites.complete({
  assetId,
  ownerUserId,
  sizeBytes: 2048,
  completedAt: '2026-08-03T10:01:00.000Z',
});
assert(rejected.status === 'rejected' && rejected.reasonCode === 'MEDIA_SIZE_MISMATCH', 'size mismatch is rejected with a stable code');

const expired = await store.mediaWrites.expirePending({
  occurredAt: '2026-08-03T10:30:00.000Z',
  limit: 25,
});
assert(expired.expiredCount === 1, 'pending expiry returns an auditable count');
const expiryClient = pool.clients[3];
assert(expiryClient.calls.some((call) => /for update skip locked/i.test(call.sql)), 'expiry safely claims due assets');
assert(expiryClient.calls.some((call) => /insert into media_asset_events/i.test(call.sql)), 'expiry records lifecycle events');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'media-write-capability',
        'pending-metadata-transaction',
        'owned-completion-lock',
        'size-mismatch-rejection',
        'deletion-event',
        'expiry-event',
        'client-release',
      ],
    },
    null,
    2,
  ),
);

function createMockPool() {
  const clients = [];
  const pool = {
    clients,
    asset: null,
    async connect() {
      const client = createMockClient(pool);
      clients.push(client);
      return client;
    },
  };
  return pool;
}

function createMockClient(pool) {
  return {
    calls: [],
    released: false,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });
      if (/insert into media_assets/i.test(normalized)) {
        pool.asset = createPendingRow(params);
        return { rows: [pool.asset] };
      }
      if (/select \* from media_assets/i.test(normalized)) {
        const row = pool.asset?.id === params[0] && pool.asset?.owner_user_id === params[1] ? pool.asset : null;
        return { rows: row ? [row] : [] };
      }
      if (/set status = 'uploaded'/i.test(normalized)) {
        pool.asset = {
          ...pool.asset,
          status: 'uploaded',
          size_bytes: params[1],
          width: params[2],
          height: params[3],
          duration_ms: params[4],
          provider_etag: params[5],
          uploaded_at: params[6],
          updated_at: params[6],
        };
        return { rows: [pool.asset] };
      }
      if (/set status = \$2/i.test(normalized)) {
        pool.asset = {
          ...pool.asset,
          status: params[1],
          failure_code: ['rejected', 'expired'].includes(params[1]) ? params[2] : pool.asset?.failure_code,
          deleted_at: params[1] === 'deleted' ? params[3] : pool.asset?.deleted_at,
          updated_at: params[3],
        };
        return { rows: [pool.asset] };
      }
      if (/with due as/i.test(normalized)) return { rows: [{ media_asset_id: assetId }] };
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
}

function createPendingRow(params = []) {
  return {
    id: params[0] || assetId,
    owner_user_id: params[1] || ownerUserId,
    provider: params[2] || 'tencent_cos',
    bucket: params[3] || 'pp-production-1250000000',
    region: params[4] || 'ap-shanghai',
    object_key: params[5] || `pp/public/post-image/${ownerUserId}/2026-08/${assetId}.jpg`,
    public_url: params[6] || `https://media.example.test/${assetId}.jpg`,
    purpose: params[7] || 'post-image',
    visibility: params[8] || 'public',
    content_type: params[9] || 'image/jpeg',
    file_extension: params[10] || 'jpg',
    declared_size_bytes: params[11] || 1024,
    max_size_bytes: params[12] || 20 * 1024 * 1024,
    size_bytes: null,
    width: null,
    height: null,
    duration_ms: null,
    status: 'pending_upload',
    audit_status: 'pending',
    expires_at: params[13] || '2026-08-03T10:15:00.000Z',
    uploaded_at: null,
    deleted_at: null,
    created_at: params[14] || '2026-08-03T10:00:00.000Z',
    updated_at: params[14] || '2026-08-03T10:00:00.000Z',
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres media write check failed: ${message}`);
}
