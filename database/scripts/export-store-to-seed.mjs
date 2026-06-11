import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const storePath = resolve(root, process.argv[2] || 'server/data/store.json');
const outputPath = resolve(root, process.argv[3] || 'database/generated/store_seed.sql');

const store = JSON.parse(await readFile(storePath, 'utf8'));
const nowIso = new Date().toISOString();

const lines = [
  '-- Generated from local server/data/store.json.',
  '-- Run after database/schema.sql. Review before applying to production.',
  'begin;',
  '',
];

emitUsers();
emitCompanions();
emitPosts();

lines.push('commit;', '');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, lines.join('\n'), 'utf8');

console.log(
  JSON.stringify(
    {
      ok: true,
      storePath,
      outputPath,
      companions: store.companions?.length || 0,
      posts: store.posts?.length || 0,
    },
    null,
    2,
  ),
);

function emitUsers() {
  section('Users');
  for (const companion of store.companions || []) {
    const userId = uuidFor(companion.userId || `${companion.id}-user`);
    insert('users', {
      id: userId,
      phone: demoPhone(companion.id),
      nickname: companion.name || companion.id,
      avatar_url: companion.avatar || companion.photo || '',
      gender: companion.gender || 'unknown',
      city: companion.baseCity || '上海',
      status: 'active',
      is_companion: true,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }
  lines.push('');
}

function emitCompanions() {
  section('Companions');
  for (const companion of store.companions || []) {
    const companionId = uuidFor(companion.id);
    insert('companions', {
      id: companionId,
      user_id: uuidFor(companion.userId || `${companion.id}-user`),
      display_name: companion.name || companion.id,
      base_city: companion.baseCity || '上海',
      gender: companion.gender || 'unknown',
      bio: companion.bio || '',
      real_photo_url: companion.photo || companion.avatar || '',
      intro_video_url: '',
      show_intro_video: false,
      status: companion.status || 'approved',
      service_enabled: companion.serviceEnabled !== false,
      rating_avg: companion.ratingAvg || 0,
      rating_count: companion.ratingCount || 0,
      completed_order_count: companion.completedOrderCount || 0,
      created_at: nowIso,
      updated_at: nowIso,
    });

    for (const tag of companion.tags || []) {
      insert('companion_tags', {
        id: uuidFor(`${companion.id}:tag:${tag}`),
        companion_id: companionId,
        tag_type: 'profile',
        tag_name: tag,
        created_at: nowIso,
      });
    }

    for (const tag of companion.safetyBadges || []) {
      insert('companion_tags', {
        id: uuidFor(`${companion.id}:safety:${tag}`),
        companion_id: companionId,
        tag_type: 'safety',
        tag_name: tag,
        created_at: nowIso,
      });
    }

    for (const area of companion.serviceAreas || []) {
      insert('service_areas', {
        id: uuidFor(area.id || `${companion.id}:area:${area.areaName}`),
        companion_id: companionId,
        city: area.city || companion.baseCity || '上海',
        area_name: area.areaName || area.name || '服务区域',
        area_type: area.areaType || 'business_area',
        lat: area.lat,
        lng: area.lng,
        radius_meters: area.radiusMeters || 3000,
        enabled: area.enabled !== false,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    for (const [index, activity] of (companion.activities || []).entries()) {
      insert('activity_pricings', {
        id: uuidFor(activity.id || `${companion.id}:activity:${activity.name}:${index}`),
        companion_id: companionId,
        activity_name: activity.name || '陪拍',
        duration_minutes: activity.durationMinutes || 120,
        price_cents: activity.priceCents || 0,
        enabled: true,
        sort_order: index,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    for (const extra of companion.extras || []) {
      insert('companion_extras', {
        id: uuidFor(extra.id || `${companion.id}:extra:${extra.name}`),
        companion_id: companionId,
        name: extra.name || '附加服务',
        unit: extra.unit || 'per_order',
        price_cents: extra.priceCents || 0,
        description: extra.unitLabel || '',
        enabled: true,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    for (const slot of companion.slots || []) {
      insert('availability_slots', {
        id: uuidFor(slot.id || `${companion.id}:slot:${slot.startAt}`),
        companion_id: companionId,
        start_at: slot.startAt,
        end_at: slot.endAt,
        status: slot.status === 'unavailable' ? 'unavailable' : 'available',
        temp_accept_enabled: false,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
  }
  lines.push('');
}

function emitPosts() {
  section('Posts');
  for (const post of store.posts || []) {
    const companionId = uuidFor(post.companion?.id || post.companionId || store.companions?.[0]?.id || 'companion');
    insert('posts', {
      id: uuidFor(post.id),
      companion_id: companionId,
      city: post.city || post.companion?.baseCity || '上海',
      location_name: post.locationName || post.location || '拍摄地点',
      location_type: 'business_area',
      lat: post.lat,
      lng: post.lng,
      time_label: post.timeLabel || '可预约',
      caption: post.caption || '',
      activity_name: post.activity || '',
      status: post.status || 'approved',
      is_feed_visible: post.isFeedVisible !== false,
      is_featured: Boolean(post.isFeatured),
      quality_score: post.qualityScore || 80,
      created_at: nowIso,
      updated_at: nowIso,
      published_at: nowIso,
    });

    for (const image of post.images || []) {
      insert('post_images', {
        id: uuidFor(image.id || `${post.id}:image:${image.url}`),
        post_id: uuidFor(post.id),
        file_url: image.url,
        file_key: image.objectKey || '',
        width: image.width,
        height: image.height,
        sort_order: image.sortOrder || 0,
        audit_status: 'approved',
        risk_flags: {},
        created_at: nowIso,
      });
    }

    for (const tag of post.styleTags || []) {
      insert('post_tags', {
        id: uuidFor(`${post.id}:tag:${tag}`),
        post_id: uuidFor(post.id),
        tag_name: tag,
      });
    }
  }
  lines.push('');
}

function section(title) {
  lines.push(`-- =========================`, `-- ${title}`, `-- =========================`);
}

function insert(table, values) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== null);
  const columns = entries.map(([key]) => key).join(', ');
  const sqlValues = entries.map(([, value]) => sqlValue(value)).join(', ');
  const conflictTarget = values.id ? '(id)' : '';
  lines.push(`insert into ${table}(${columns}) values (${sqlValues}) on conflict ${conflictTarget} do nothing;`);
}

function sqlValue(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (value && typeof value === 'object') return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  return `'${String(value ?? '').replaceAll("'", "''")}'`;
}

function uuidFor(value) {
  const hash = createHash('sha1').update(`pp-platform:${value}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function demoPhone(value) {
  const digits = createHash('sha1').update(String(value)).digest('hex').replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
  return `1${digits.slice(0, 10)}`;
}
