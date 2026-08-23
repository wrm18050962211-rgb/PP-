import { readFileSync } from 'node:fs';
import { createPostgresStore } from '../store/postgresStore.mjs';

const ids = {
  user: '00000000-0000-4000-8000-000000000901',
  companion: '00000000-0000-4000-8000-000000000902',
  post: '00000000-0000-4000-8000-000000000903',
  image: '00000000-0000-4000-8000-000000000904',
  favorite: '00000000-0000-4000-8000-000000000905',
  viewer: '00000000-0000-4000-8000-000000000906',
};

const pool = createMockPool();
const store = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => pool,
  featureFlags: { storeLiteComplianceEnabled: true },
});

assert(store.capabilities.contentReads === true, 'postgres store advertises content reads');
assert(store.capabilities.contentWrites === true, 'postgres store advertises content writes');

const page = await store.content.listPublicPosts({ limit: 20, cursor: '0', city: 'Shanghai', userId: ids.viewer });
assert(page.items.length === 1, 'content gateway maps a public feed page');
assert(page.items[0]?.id === ids.post, 'content gateway preserves post id');
assert(page.items[0]?.companion?.id === ids.companion, 'content gateway attaches companion profile');
assert(page.items[0]?.images?.[0]?.url === 'https://cdn.example.com/post.jpg', 'content gateway attaches approved images');

const collection = await store.content.setUserCollection({
  favoriteId: ids.favorite,
  userId: ids.user,
  kind: 'like',
  targetId: ids.post,
  active: true,
});
assert(collection.active === true, 'collection gateway returns active state');
assert(collection.count === 1, 'collection gateway returns persisted count');

const feedClient = pool.clients[0];
const collectionClient = pool.clients[1];
assert(feedClient.calls.some((call) => /limit \$2 offset \$3/i.test(call.sql)), 'feed query uses database pagination');
assert(feedClient.calls.some((call) => /status = 'approved'/i.test(call.sql) && /is_feed_visible = true/i.test(call.sql)), 'feed query enforces public visibility');
assert(feedClient.calls.some((call) => /not exists[\s\S]*from user_companion_blocks/i.test(call.sql)), 'feed query excludes photographers blocked by the current user');
assert(feedClient.calls.some((call) => call.params?.[4] === ids.viewer), 'feed query binds the authenticated viewer id');
assert(collectionClient.calls.some((call) => /insert into favorites/i.test(call.sql) && /on conflict/i.test(call.sql)), 'collection write is idempotent');
assert(collectionClient.calls.some((call) => /update posts/i.test(call.sql) && /like_count/i.test(call.sql)), 'like write updates persisted count');
assert(collectionClient.calls.some((call) => /^commit$/i.test(call.sql)), 'collection write commits transaction');
assert(pool.clients.every((client) => client.released), 'content gateway releases every client');

const source = readFileSync(new URL('../store/postgresContentGateway.mjs', import.meta.url), 'utf8');
const sqlSchema = readFileSync(new URL('../../database/schema.sql', import.meta.url), 'utf8');
const prismaSchema = readFileSync(new URL('../../database/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../database/migrations/20260725_add_favorites_target_index.sql', import.meta.url), 'utf8');
assert(/updateCompanionProfileTransaction/.test(source), 'content gateway exposes profile transaction');
assert(/createCompanionPostTransaction/.test(source), 'content gateway exposes post creation transaction');
assert(/submitCompanionPostReviewTransaction/.test(source), 'content gateway exposes post review transaction');
assert(/where p\.id = \$1 and p\.companion_id = \$2 and c\.user_id = \$3/i.test(source), 'post review enforces resource ownership');
assert(/insert into audit_cases/i.test(source), 'post review creates an audit case');
assert(/getPublicPost[\s\S]*user_companion_blocks/i.test(source), 'post detail applies the user block relation');
assert(/getPublicCompanion[\s\S]*queryCompanions[\s\S]*user_companion_blocks/i.test(source), 'companion detail applies the user block relation');
assert(/idx_favorites_target[\s\S]*target_type,\s*target_id/i.test(sqlSchema), 'sql schema indexes collection target lookups');
assert(/@@index\(\[targetType,\s*targetId\]\)/.test(prismaSchema), 'prisma schema indexes collection target lookups');
assert(/create index if not exists idx_favorites_target/i.test(migration), 'content index migration is repeatable');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'content-capabilities',
        'database-feed-pagination',
        'public-visibility',
        'authenticated-block-filter',
        'profile-and-post-transactions',
        'collection-idempotency',
        'resource-ownership',
        'collection-target-index',
        'client-release',
      ],
      clientCount: pool.clients.length,
    },
    null,
    2,
  ),
);

function createMockPool() {
  const clients = [];
  return {
    clients,
    async connect() {
      const client = createMockClient();
      clients.push(client);
      return client;
    },
  };
}

function createMockClient() {
  return {
    calls: [],
    released: false,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });
      if (/select p\.\*.*from posts p join companions c/i.test(normalized)) {
        return {
          rows: [
            {
              id: ids.post,
              companion_id: ids.companion,
              city: 'Shanghai',
              location_name: 'Wukang Road',
              time_label: 'Sunset',
              caption: 'Portrait walk',
              activity_name: 'Citywalk',
              status: 'approved',
              is_feed_visible: true,
              is_featured: false,
              quality_score: 90,
              like_count: 3,
              favorite_count: 2,
              created_at: '2026-07-25T08:00:00.000Z',
              published_at: '2026-07-25T08:00:00.000Z',
            },
          ],
        };
      }
      if (/from companions c where c\.id = any/i.test(normalized)) {
        return {
          rows: [
            {
              id: ids.companion,
              user_id: ids.user,
              display_name: 'Mori',
              base_city: 'Shanghai',
              gender: 'female',
              bio: 'Portrait photographer',
              real_photo_url: 'https://cdn.example.com/avatar.jpg',
              status: 'approved',
              service_enabled: true,
              rating_avg: 4.9,
              rating_count: 12,
              follower_count: 4,
            },
          ],
        };
      }
      if (/from post_images/i.test(normalized)) {
        return {
          rows: [
            {
              id: ids.image,
              post_id: ids.post,
              file_url: 'https://cdn.example.com/post.jpg',
              sort_order: 1,
              audit_status: 'approved',
            },
          ],
        };
      }
      if (/from posts where id = \$1/i.test(normalized)) return { rows: [{ id: ids.post }] };
      if (/insert into favorites/i.test(normalized)) return { rows: [{ id: ids.favorite }] };
      if (/select count\(\*\)::int as count from favorites/i.test(normalized)) return { rows: [{ count: 1 }] };
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres content gateway check failed: ${message}`);
}
