import { buildStoreFromPostgresRows } from './postgresMappers.mjs';

const collectionTargets = {
  like: { targetType: 'post_like', table: 'posts' },
  favorite: { targetType: 'post_favorite', table: 'posts' },
  follow: { targetType: 'companion_follow', table: 'companions' },
};

export async function listPublicPosts(client, options = {}) {
  assertClient(client);
  const limit = clampLimit(options.limit);
  const offset = parseCursor(options.cursor);
  const city = normalize(options.city);
  const companionId = normalize(options.companionId);
  const viewerUserId = normalizeUuid(options.userId);
  const result = await client.query(
    `${publicPostSelect()}
     where p.status = 'approved'
       and p.is_feed_visible = true
       and c.status = 'approved'
       and c.service_enabled = true
       and ($1::text = '' or lower(p.city) like lower($1) or lower(p.location_name) like lower($1))
       and ($4::text = '' or p.companion_id::text = $4)
       ${blockedCompanionPredicate(viewerUserId, 'p.companion_id', 5)}
     order by p.is_featured desc, p.published_at desc nulls last, p.created_at desc, p.id desc
     limit $2 offset $3`,
    [city ? `%${city}%` : '', limit + 1, offset, companionId, viewerUserId],
  );

  const rows = result.rows || [];
  const pageRows = rows.slice(0, limit);
  const items = await hydratePosts(client, pageRows);
  return {
    items,
    nextCursor: rows.length > limit ? String(offset + limit) : null,
    hasMore: rows.length > limit,
  };
}

export async function getPublicPost(client, postId, options = {}) {
  assertClient(client);
  const viewerUserId = normalizeUuid(options.userId);
  const result = await client.query(
    `${publicPostSelect()}
     where p.id = $1
       and p.status = 'approved'
       and p.is_feed_visible = true
       and c.status = 'approved'
       and c.service_enabled = true
       ${blockedCompanionPredicate(viewerUserId, 'p.companion_id', 2)}
     limit 1`,
    [postId, viewerUserId],
  );
  const [post] = await hydratePosts(client, result.rows || []);
  return post || null;
}

export async function getPublicCompanion(client, companionId, options = {}) {
  assertClient(client);
  const rows = await queryCompanions(client, [companionId], true, normalizeUuid(options.userId));
  const [companion] = await hydrateCompanions(client, rows);
  if (!companion) return null;
  const postCountResult = await client.query(
    `select count(*)::int as post_count
     from posts
     where companion_id = $1
       and status = 'approved'
       and is_feed_visible = true`,
    [companionId],
  );
  return { ...companion, postCount: number(postCountResult.rows?.[0]?.post_count) };
}

export async function getOwnCompanionProfile(client, draft) {
  assertClient(client);
  const result = await client.query(
    `select c.*,
            (
              select count(*)::int
              from favorites f
              where f.target_type = 'companion_follow'
                and f.target_id = c.id
            ) as follower_count
     from companions c
     where c.id = $1 and c.user_id = $2
     limit 1`,
    [draft.companionId, draft.userId],
  );
  const rows = result.rows || [];
  const [companion] = await hydrateCompanions(client, rows);
  if (!companion) return null;
  const tags = await client.query(
    `select tag_type, tag_name
     from companion_tags
     where companion_id = $1
     order by created_at asc`,
    [draft.companionId],
  );
  return {
    companion,
    profile: buildEditableProfile(companion, tags.rows || []),
  };
}

export async function getUserCollections(client, userId) {
  assertClient(client);
  const result = await client.query(
    `select target_type, target_id
     from favorites
     where user_id = $1
       and target_type in ('post_like', 'post_favorite', 'companion_follow')
     order by created_at desc, id desc`,
    [userId],
  );
  const state = {
    likedPostIds: [],
    favoritePostIds: [],
    followingIds: [],
  };
  for (const row of result.rows || []) {
    const id = String(row.target_id);
    if (row.target_type === 'post_like') state.likedPostIds.push(id);
    if (row.target_type === 'post_favorite') state.favoritePostIds.push(id);
    if (row.target_type === 'companion_follow') state.followingIds.push(id);
  }
  return state;
}

export async function listUserCollection(client, options = {}) {
  assertClient(client);
  const target = resolveCollectionTarget(options.kind);
  const limit = clampLimit(options.limit);
  const offset = parseCursor(options.cursor);
  const result = await client.query(
    `select id, target_id, created_at
     from favorites
     where user_id = $1 and target_type = $2
     order by created_at desc, id desc
     limit $3 offset $4`,
    [options.userId, target.targetType, limit + 1, offset],
  );
  const rows = result.rows || [];
  const pageRows = rows.slice(0, limit);
  const ids = pageRows.map((row) => String(row.target_id));
  let items = [];

  if (target.table === 'posts') {
    const postResult = ids.length
      ? await client.query(
          `${publicPostSelect()}
           where p.id = any($1::uuid[])
             and p.status = 'approved'
             and p.is_feed_visible = true
             and c.status = 'approved'
             and c.service_enabled = true`,
          [ids],
        )
      : { rows: [] };
    const posts = await hydratePosts(client, postResult.rows || []);
    const postById = new Map(posts.map((post) => [post.id, post]));
    items = ids.map((id) => postById.get(id)).filter(Boolean);
  } else {
    const companions = await hydrateCompanions(client, await queryCompanions(client, ids, true));
    const companionById = new Map(companions.map((companion) => [companion.id, companion]));
    items = ids.map((id) => companionById.get(id)).filter(Boolean);
  }

  return {
    items,
    nextCursor: rows.length > limit ? String(offset + limit) : null,
    hasMore: rows.length > limit,
  };
}

export async function setUserCollectionTransaction(client, draft) {
  assertClient(client);
  const target = resolveCollectionTarget(draft.kind);
  await client.query('begin');
  try {
    const targetResult = await client.query(
      target.table === 'posts'
        ? `select id
           from posts
           where id = $1 and status = 'approved' and is_feed_visible = true
           for share`
        : `select id
           from companions
           where id = $1 and status = 'approved' and service_enabled = true
           for share`,
      [draft.targetId],
    );
    if (!targetResult.rows?.[0]) throw contentError('COLLECTION_TARGET_NOT_FOUND', 'Collection target not found', 404);

    let changed = false;
    if (draft.active) {
      const inserted = await client.query(
        `insert into favorites (id, user_id, target_type, target_id)
         values ($1, $2, $3, $4)
         on conflict (user_id, target_type, target_id) do nothing
         returning id`,
        [draft.favoriteId, draft.userId, target.targetType, draft.targetId],
      );
      changed = Boolean(inserted.rows?.[0]);
    } else {
      const deleted = await client.query(
        `delete from favorites
         where user_id = $1 and target_type = $2 and target_id = $3
         returning id`,
        [draft.userId, target.targetType, draft.targetId],
      );
      changed = Boolean(deleted.rows?.[0]);
    }

    if (changed && target.targetType === 'post_like') {
      await client.query(
        `update posts
         set like_count = greatest(0, like_count + $1),
             updated_at = now()
         where id = $2`,
        [draft.active ? 1 : -1, draft.targetId],
      );
    }

    const countResult = await client.query(
      `select count(*)::int as count
       from favorites
       where target_type = $1 and target_id = $2`,
      [target.targetType, draft.targetId],
    );
    await client.query('commit');
    return {
      kind: draft.kind,
      targetId: draft.targetId,
      active: Boolean(draft.active),
      count: number(countResult.rows?.[0]?.count),
      changed,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function updateCompanionProfileTransaction(client, draft) {
  assertClient(client);
  assertRequired(draft, ['companionId', 'userId', 'displayName', 'bio']);
  await client.query('begin');
  try {
    const ownerResult = await client.query(
      `select id
       from companions
       where id = $1 and user_id = $2
       for update`,
      [draft.companionId, draft.userId],
    );
    if (!ownerResult.rows?.[0]) throw contentError('COMPANION_PROFILE_FORBIDDEN', 'Companion profile is not owned by the current user', 403);

    await client.query(
      `update companions
       set display_name = $1,
           bio = $2,
           updated_at = now()
       where id = $3`,
      [draft.displayName, draft.bio, draft.companionId],
    );
    await client.query(
      `delete from companion_tags
       where companion_id = $1
         and tag_type in ('profile', 'personality', 'style', 'interaction', 'equipment')`,
      [draft.companionId],
    );

    const groupedTags = [
      ['personality', draft.personalityTags],
      ['style', draft.styleTags],
      ['interaction', draft.interactionTags],
      ['equipment', draft.equipment],
    ];
    const publicTags = uniqueStrings(groupedTags.flatMap(([, tags]) => tags || []));
    for (const tag of publicTags) {
      await insertCompanionTag(client, draft.companionId, 'profile', tag);
    }
    for (const [tagType, tags] of groupedTags) {
      for (const tag of uniqueStrings(tags || [])) {
        await insertCompanionTag(client, draft.companionId, tagType, tag);
      }
    }

    await client.query('commit');
    return { companionId: draft.companionId, updatedAt: new Date().toISOString() };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function createCompanionPostTransaction(client, draft) {
  assertClient(client);
  assertRequired(draft, ['postId', 'companionId', 'userId', 'city', 'locationName', 'timeLabel', 'caption']);
  if (!Array.isArray(draft.images) || draft.images.length === 0) {
    throw contentError('POST_IMAGES_REQUIRED', 'At least one post image is required', 400);
  }

  await client.query('begin');
  try {
    const ownerResult = await client.query(
      `select id
       from companions
       where id = $1 and user_id = $2
       for share`,
      [draft.companionId, draft.userId],
    );
    if (!ownerResult.rows?.[0]) throw contentError('COMPANION_POST_FORBIDDEN', 'Companion is not owned by the current user', 403);

    await client.query(
      `insert into posts (
        id, companion_id, city, location_name, time_label, caption, activity_name,
        status, is_feed_visible, is_featured, quality_score
      ) values ($1, $2, $3, $4, $5, $6, $7, 'draft', false, false, 0)`,
      [
        draft.postId,
        draft.companionId,
        draft.city,
        draft.locationName,
        draft.timeLabel,
        draft.caption,
        draft.activityName || null,
      ],
    );
    for (const [index, image] of draft.images.entries()) {
      await client.query(
        `insert into post_images (
          id, post_id, file_url, file_key, width, height, sort_order, audit_status
        ) values ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
        [
          image.id,
          draft.postId,
          image.fileUrl,
          image.fileKey || null,
          image.width || null,
          image.height || null,
          image.sortOrder || index + 1,
        ],
      );
    }
    for (const tag of normalizePostTags(draft.tags)) {
      await client.query(
        `insert into post_tags (id, post_id, tag_name)
         values ($1, $2, $3)
         on conflict (post_id, tag_name) do nothing`,
        [tag.id, draft.postId, tag.name],
      );
    }
    await client.query('commit');
    return { id: draft.postId, status: 'draft', isFeedVisible: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function submitCompanionPostReviewTransaction(client, draft) {
  assertClient(client);
  assertRequired(draft, ['postId', 'companionId', 'userId', 'auditCaseId']);
  await client.query('begin');
  try {
    const postResult = await client.query(
      `select p.id, p.status, p.companion_id
       from posts p
       join companions c on c.id = p.companion_id
       where p.id = $1 and p.companion_id = $2 and c.user_id = $3
       for update of p`,
      [draft.postId, draft.companionId, draft.userId],
    );
    const post = postResult.rows?.[0];
    if (!post) throw contentError('COMPANION_POST_FORBIDDEN', 'Post is not owned by the current companion', 403);
    if (!['draft', 'rejected'].includes(post.status)) {
      throw contentError('POST_STATUS_INVALID', 'Only draft or rejected posts can be submitted', 409);
    }

    const imageResult = await client.query(
      `select count(*)::int as image_count
       from post_images
       where post_id = $1`,
      [draft.postId],
    );
    if (number(imageResult.rows?.[0]?.image_count) < 1) {
      throw contentError('POST_IMAGES_REQUIRED', 'At least one post image is required', 400);
    }

    await client.query(
      `update posts
       set status = 'pending_review',
           is_feed_visible = false,
           updated_at = now()
       where id = $1`,
      [draft.postId],
    );
    await client.query(
      `update post_images
       set audit_status = 'pending'
       where post_id = $1`,
      [draft.postId],
    );
    await client.query(
      `insert into audit_cases (
        id, target_type, target_id, status, risk_level, submitted_by, snapshot
      ) values ($1, 'post', $2, 'pending', 'low', $3, $4)`,
      [draft.auditCaseId, draft.postId, draft.userId, { companionId: draft.companionId }],
    );
    await client.query('commit');
    return { id: draft.postId, status: 'pending_review', isFeedVisible: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function hydratePosts(client, postRows) {
  if (!postRows.length) return [];
  const postIds = postRows.map((row) => String(row.id));
  const companionIds = uniqueStrings(postRows.map((row) => String(row.companion_id)));
  const [
    companions,
    companionTags,
    serviceAreas,
    activityPricings,
    companionExtras,
    availabilitySlots,
    postImages,
    postTags,
  ] = await Promise.all([
    queryCompanions(client, companionIds, false),
    queryRows(client, `select * from companion_tags where companion_id = any($1::uuid[]) order by created_at asc`, [companionIds]),
    queryRows(client, `select * from service_areas where companion_id = any($1::uuid[]) and enabled = true order by created_at asc`, [companionIds]),
    queryRows(client, `select * from activity_pricings where companion_id = any($1::uuid[]) and enabled = true order by sort_order asc, created_at asc`, [companionIds]),
    queryRows(client, `select * from companion_extras where companion_id = any($1::uuid[]) and enabled = true order by created_at asc`, [companionIds]),
    queryRows(client, `select * from availability_slots where companion_id = any($1::uuid[]) and status in ('available', 'locked', 'booked', 'unavailable') order by start_at asc`, [companionIds]),
    queryRows(client, `select * from post_images where post_id = any($1::uuid[]) and audit_status = 'approved' order by sort_order asc, created_at asc`, [postIds]),
    queryRows(client, `select * from post_tags where post_id = any($1::uuid[])`, [postIds]),
  ]);
  const store = buildStoreFromPostgresRows({
    companions,
    companionTags,
    serviceAreas,
    activityPricings,
    companionExtras,
    availabilitySlots,
    posts: postRows,
    postImages,
    postTags,
  });
  const postById = new Map(store.posts.map((post) => [post.id, post]));
  return postIds.map((id) => postById.get(id)).filter(Boolean);
}

async function hydrateCompanions(client, companionRows) {
  if (!companionRows.length) return [];
  const companionIds = companionRows.map((row) => String(row.id));
  const [companionTags, serviceAreas, activityPricings, companionExtras, availabilitySlots] = await Promise.all([
    queryRows(client, `select * from companion_tags where companion_id = any($1::uuid[]) order by created_at asc`, [companionIds]),
    queryRows(client, `select * from service_areas where companion_id = any($1::uuid[]) and enabled = true order by created_at asc`, [companionIds]),
    queryRows(client, `select * from activity_pricings where companion_id = any($1::uuid[]) and enabled = true order by sort_order asc, created_at asc`, [companionIds]),
    queryRows(client, `select * from companion_extras where companion_id = any($1::uuid[]) and enabled = true order by created_at asc`, [companionIds]),
    queryRows(client, `select * from availability_slots where companion_id = any($1::uuid[]) and status in ('available', 'locked', 'booked', 'unavailable') order by start_at asc`, [companionIds]),
  ]);
  return buildStoreFromPostgresRows({
    companions: companionRows,
    companionTags,
    serviceAreas,
    activityPricings,
    companionExtras,
    availabilitySlots,
  }).companions;
}

async function queryCompanions(client, companionIds, publicOnly, viewerUserId = null) {
  if (!companionIds.length) return [];
  return queryRows(
    client,
    `select c.*,
            (
              select count(*)::int
              from favorites f
              where f.target_type = 'companion_follow'
                and f.target_id = c.id
            ) as follower_count
     from companions c
     where c.id = any($1::uuid[])
       and ($2::boolean = false or (c.status = 'approved' and c.service_enabled = true))
       ${blockedCompanionPredicate(viewerUserId, 'c.id', 3)}`,
    [companionIds, Boolean(publicOnly), normalizeUuid(viewerUserId)],
  );
}

function publicPostSelect() {
  return `select p.*,
                 (
                   select count(*)::int
                   from favorites f
                   where f.target_type = 'post_favorite'
                     and f.target_id = p.id
                 ) as favorite_count,
                 (
                   select count(*)::int
                   from favorites f
                   where f.target_type = 'companion_follow'
                     and f.target_id = p.companion_id
                 ) as follower_count
          from posts p
          join companions c on c.id = p.companion_id`;
}

function buildEditableProfile(companion, tags) {
  const byType = (tagType) => tags.filter((tag) => tag.tag_type === tagType).map((tag) => tag.tag_name);
  return {
    companionId: companion.id,
    displayName: companion.name,
    approvedAvatarUrl: companion.avatar || companion.photo || '',
    pendingAvatarUrl: '',
    avatarReviewStatus: 'approved',
    bio: companion.bio || '',
    personalityTags: byType('personality'),
    styleTags: byType('style'),
    interactionTags: byType('interaction'),
    equipment: byType('equipment'),
    registrationGenderLabel: companion.gender || 'unknown',
    registrationAgeRangeLabel: 'locked',
    updatedAt: new Date().toISOString(),
  };
}

async function insertCompanionTag(client, companionId, tagType, tagName) {
  await client.query(
    `insert into companion_tags (companion_id, tag_type, tag_name)
     values ($1, $2, $3)
     on conflict (companion_id, tag_type, tag_name) do nothing`,
    [companionId, tagType, tagName],
  );
}

async function queryRows(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows || [];
}

function resolveCollectionTarget(kind) {
  const target = collectionTargets[normalize(kind)];
  if (!target) throw contentError('COLLECTION_KIND_INVALID', 'Collection kind must be like, favorite, or follow', 400);
  return target;
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(Math.floor(parsed), 50));
}

function parseCursor(value) {
  const parsed = Number.parseInt(String(value || '0'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map((value) => normalize(value)).filter(Boolean)));
}

function normalizePostTags(tags) {
  const byName = new Map();
  for (const tag of Array.isArray(tags) ? tags : []) {
    const name = normalize(typeof tag === 'string' ? tag : tag?.name);
    if (!name || byName.has(name)) continue;
    byName.set(name, {
      id: typeof tag === 'object' && tag?.id ? tag.id : null,
      name,
    });
  }
  return Array.from(byName.values());
}

function normalize(value) {
  return String(value ?? '').trim();
}

function normalizeUuid(value) {
  const normalized = normalize(value);
  return normalized || null;
}

function blockedCompanionPredicate(viewerUserId, companionExpression, parameterIndex) {
  const parameter = `$${parameterIndex}`;
  if (!viewerUserId) return `and ${parameter}::uuid is null`;
  return `and not exists (
            select 1
            from user_companion_blocks ucb
            where ucb.user_id = ${parameter}
              and ucb.companion_id = ${companionExpression}
          )`;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('PostgreSQL client with query(sql, params) is required');
  }
}

function assertRequired(draft, fields) {
  const missing = fields.filter((field) => draft?.[field] === undefined || draft?.[field] === null || draft?.[field] === '');
  if (missing.length) throw contentError('CONTENT_VALIDATION_ERROR', `Missing content fields: ${missing.join(', ')}`, 400);
}

function contentError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
