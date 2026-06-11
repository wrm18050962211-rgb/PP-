import { buildStoreFromPostgresRows } from '../store/postgresMappers.mjs';

const rows = {
  companions: [
    {
      id: 'companion-pg-1',
      user_id: 'user-pg-1',
      display_name: 'PG Demo',
      base_city: '上海',
      gender: 'female',
      bio: 'PostgreSQL read model demo',
      real_photo_url: 'https://cdn.example.com/avatar.jpg',
      status: 'approved',
      service_enabled: true,
      rating_avg: '4.9',
      rating_count: 23,
      completed_order_count: 18,
    },
  ],
  companionTags: [
    { companion_id: 'companion-pg-1', tag_type: 'profile', tag_name: 'Citywalk' },
    { companion_id: 'companion-pg-1', tag_type: 'safety', tag_name: '实名认证' },
  ],
  serviceAreas: [
    {
      id: 'area-pg-1',
      companion_id: 'companion-pg-1',
      city: '上海',
      area_name: '武康路',
      area_type: 'business_area',
      lat: '31.2109000',
      lng: '121.4457000',
      radius_meters: 4000,
      enabled: true,
    },
  ],
  activityPricings: [
    {
      id: 'activity-pg-1',
      companion_id: 'companion-pg-1',
      activity_name: 'Citywalk',
      duration_minutes: 120,
      price_cents: 39900,
    },
  ],
  companionExtras: [
    {
      id: 'extra-pg-1',
      companion_id: 'companion-pg-1',
      name: '精修返图',
      unit: 'per_photo',
      price_cents: 3900,
      description: '每张',
    },
  ],
  availabilitySlots: [
    {
      id: 'slot-pg-1',
      companion_id: 'companion-pg-1',
      start_at: '2026-06-12T06:00:00.000Z',
      end_at: '2026-06-12T08:00:00.000Z',
      status: 'available',
    },
  ],
  posts: [
    {
      id: 'post-pg-1',
      companion_id: 'companion-pg-1',
      city: '上海',
      location_name: '武康路',
      lat: '31.2109000',
      lng: '121.4457000',
      time_label: '今天可拍',
      caption: 'PG seed post',
      activity_name: 'Citywalk',
      status: 'approved',
      is_feed_visible: true,
      is_featured: true,
      quality_score: '95',
    },
  ],
  postImages: [
    {
      id: 'image-pg-1',
      post_id: 'post-pg-1',
      file_url: 'https://cdn.example.com/post.jpg',
      file_key: 'pp/post-image/post.jpg',
      width: 1200,
      height: 1600,
      sort_order: 0,
    },
  ],
  postTags: [{ post_id: 'post-pg-1', tag_name: '胶片感' }],
};

const store = buildStoreFromPostgresRows(rows);
const companion = store.companions[0];
const post = store.posts[0];

assert(store.meta.version === 3, 'store version is normalized');
assert(companion.name === 'PG Demo', 'companion display name maps');
assert(companion.tags.includes('Citywalk'), 'companion profile tags map');
assert(companion.safetyBadges.includes('实名认证'), 'companion safety badges map');
assert(companion.activities[0].priceText === '¥399', 'activity price maps');
assert(companion.extras[0].unitLabel === '每张', 'extras map');
assert(companion.slots[0].dateLabel === '2026-06-12', 'slot date maps');
assert(post.companion.id === companion.id, 'post embeds companion');
assert(post.images[0].url.includes('post.jpg'), 'post image maps');
assert(post.styleTags.includes('胶片感'), 'post tags map');
assert(store.orders.length === 0 && store.payments.length === 0, 'transactional write models start empty');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['companions', 'tags', 'service-areas', 'activities', 'extras', 'slots', 'posts', 'images'],
      companionCount: store.companions.length,
      postCount: store.posts.length,
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres mapper check failed: ${message}`);
}
