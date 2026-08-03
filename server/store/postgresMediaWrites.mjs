export async function createPendingMediaAssetTransaction(client, draft) {
  assertClient(client);
  assertPendingDraft(draft);
  await client.query('begin');
  try {
    const inserted = await client.query(
      `insert into media_assets (
        id, owner_user_id, provider, bucket, region, object_key, public_url,
        purpose, visibility, content_type, file_extension, declared_size_bytes,
        max_size_bytes, status, audit_status, expires_at, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12,
        $13, 'pending_upload', 'pending', $14, $15, $15
      )
      returning *`,
      [
        draft.assetId,
        draft.ownerUserId,
        draft.provider,
        draft.bucket,
        draft.region,
        draft.objectKey,
        draft.publicUrl,
        draft.purpose,
        draft.visibility,
        draft.contentType,
        draft.fileExtension,
        draft.declaredSizeBytes,
        draft.maxSizeBytes,
        draft.expiresAt,
        draft.createdAt,
      ],
    );
    const row = inserted.rows?.[0];
    await insertMediaEvent(client, {
      assetId: draft.assetId,
      actorUserId: draft.ownerUserId,
      fromStatus: null,
      toStatus: 'pending_upload',
      reasonCode: 'UPLOAD_POLICY_CREATED',
      occurredAt: draft.createdAt,
    });
    await client.query('commit');
    return mapMediaAssetRow(row);
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function completeMediaAssetTransaction(client, draft) {
  assertClient(client);
  await client.query('begin');
  try {
    const selected = await selectOwnedAssetForUpdate(client, draft.assetId, draft.ownerUserId);
    if (!selected) {
      await client.query('commit');
      return { status: 'not_found' };
    }
    if (selected.status === 'uploaded') {
      await client.query('commit');
      return { status: 'uploaded', asset: mapMediaAssetRow(selected), idempotent: true };
    }
    if (selected.status !== 'pending_upload') {
      await client.query('commit');
      return { status: selected.status, asset: mapMediaAssetRow(selected) };
    }
    if (new Date(selected.expires_at).getTime() <= new Date(draft.completedAt).getTime()) {
      const expired = await updateMediaStatus(client, {
        assetId: selected.id,
        fromStatus: selected.status,
        toStatus: 'expired',
        actorUserId: draft.ownerUserId,
        reasonCode: 'UPLOAD_POLICY_EXPIRED',
        occurredAt: draft.completedAt,
      });
      await client.query('commit');
      return { status: 'expired', asset: mapMediaAssetRow(expired) };
    }

    const completedSize = Number(draft.sizeBytes);
    if (
      !Number.isSafeInteger(completedSize) ||
      completedSize <= 0 ||
      completedSize !== Number(selected.declared_size_bytes) ||
      completedSize > Number(selected.max_size_bytes)
    ) {
      const rejected = await updateMediaStatus(client, {
        assetId: selected.id,
        fromStatus: selected.status,
        toStatus: 'rejected',
        actorUserId: draft.ownerUserId,
        reasonCode: 'MEDIA_SIZE_MISMATCH',
        occurredAt: draft.completedAt,
      });
      await client.query('commit');
      return { status: 'rejected', reasonCode: 'MEDIA_SIZE_MISMATCH', asset: mapMediaAssetRow(rejected) };
    }

    const updated = await client.query(
      `update media_assets
       set status = 'uploaded',
           size_bytes = $2,
           width = $3,
           height = $4,
           duration_ms = $5,
           provider_etag = $6,
           uploaded_at = $7,
           updated_at = $7
       where id = $1
       returning *`,
      [
        selected.id,
        completedSize,
        positiveIntegerOrNull(draft.width),
        positiveIntegerOrNull(draft.height),
        positiveIntegerOrNull(draft.durationMs),
        normalizeProviderEtag(draft.providerEtag),
        draft.completedAt,
      ],
    );
    await insertMediaEvent(client, {
      assetId: selected.id,
      actorUserId: draft.ownerUserId,
      fromStatus: 'pending_upload',
      toStatus: 'uploaded',
      reasonCode: 'CLIENT_UPLOAD_CONFIRMED',
      occurredAt: draft.completedAt,
      metadata: { sizeBytes: completedSize },
    });
    await client.query('commit');
    return { status: 'uploaded', asset: mapMediaAssetRow(updated.rows?.[0]), idempotent: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function rejectPendingMediaAssetTransaction(client, draft) {
  assertClient(client);
  await client.query('begin');
  try {
    const selected = await selectOwnedAssetForUpdate(client, draft.assetId, draft.ownerUserId);
    if (!selected || selected.status !== 'pending_upload') {
      await client.query('commit');
      return selected ? mapMediaAssetRow(selected) : null;
    }
    const updated = await updateMediaStatus(client, {
      assetId: selected.id,
      fromStatus: selected.status,
      toStatus: 'rejected',
      actorUserId: draft.ownerUserId,
      reasonCode: draft.reasonCode || 'UPLOAD_CREDENTIAL_FAILED',
      occurredAt: draft.rejectedAt,
    });
    await client.query('commit');
    return mapMediaAssetRow(updated);
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function deleteMediaAssetTransaction(client, draft) {
  assertClient(client);
  await client.query('begin');
  try {
    const selected = await selectOwnedAssetForUpdate(client, draft.assetId, draft.ownerUserId);
    if (!selected) {
      await client.query('commit');
      return { status: 'not_found' };
    }
    if (selected.status === 'deleted') {
      await client.query('commit');
      return { status: 'deleted', asset: mapMediaAssetRow(selected), idempotent: true };
    }
    const updated = await updateMediaStatus(client, {
      assetId: selected.id,
      fromStatus: selected.status,
      toStatus: 'deleted',
      actorUserId: draft.ownerUserId,
      reasonCode: 'USER_DELETE_REQUESTED',
      occurredAt: draft.deletedAt,
    });
    await client.query('commit');
    return { status: 'deleted', asset: mapMediaAssetRow(updated), idempotent: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function expirePendingMediaAssetsTransaction(client, draft) {
  assertClient(client);
  const limit = Math.max(1, Math.min(500, Number(draft.limit) || 100));
  const result = await client.query(
    `with due as (
       select id, owner_user_id
       from media_assets
       where status = 'pending_upload'
         and expires_at <= $1
       order by expires_at asc
       for update skip locked
       limit $2
     ), updated as (
       update media_assets asset
       set status = 'expired',
           failure_code = 'UPLOAD_POLICY_EXPIRED',
           updated_at = $1
       from due
       where asset.id = due.id
       returning asset.id, asset.owner_user_id
     )
     insert into media_asset_events (
       id, media_asset_id, actor_user_id, from_status, to_status, reason_code, metadata, created_at
     )
     select gen_random_uuid(), id, owner_user_id, 'pending_upload', 'expired', 'UPLOAD_POLICY_EXPIRED', '{}'::jsonb, $1
     from updated
     returning media_asset_id`,
    [draft.occurredAt, limit],
  );
  return { expiredCount: result.rows?.length || 0 };
}

async function selectOwnedAssetForUpdate(client, assetId, ownerUserId) {
  const result = await client.query(
    `select *
     from media_assets
     where id = $1
       and owner_user_id = $2
     for update`,
    [assetId, ownerUserId],
  );
  return result.rows?.[0] || null;
}

async function updateMediaStatus(client, draft) {
  const result = await client.query(
    `update media_assets
     set status = $2,
         failure_code = case when $2 in ('rejected', 'expired') then $3 else failure_code end,
         deleted_at = case when $2 = 'deleted' then $4 else deleted_at end,
         updated_at = $4
     where id = $1
     returning *`,
    [draft.assetId, draft.toStatus, draft.reasonCode || null, draft.occurredAt],
  );
  await insertMediaEvent(client, draft);
  return result.rows?.[0] || null;
}

function insertMediaEvent(client, draft) {
  return client.query(
    `insert into media_asset_events (
       id, media_asset_id, actor_user_id, from_status, to_status, reason_code, metadata, created_at
     ) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [
      draft.assetId,
      draft.actorUserId || null,
      draft.fromStatus || null,
      draft.toStatus,
      draft.reasonCode || null,
      JSON.stringify(draft.metadata || {}),
      draft.occurredAt,
    ],
  );
}

export function mapMediaAssetRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    provider: row.provider,
    bucket: row.bucket,
    region: row.region,
    objectKey: row.object_key,
    publicUrl: row.public_url || null,
    purpose: row.purpose,
    visibility: row.visibility,
    contentType: row.content_type,
    fileExtension: row.file_extension,
    declaredSizeBytes: numberOrNull(row.declared_size_bytes),
    sizeBytes: numberOrNull(row.size_bytes),
    maxSizeBytes: numberOrNull(row.max_size_bytes),
    width: numberOrNull(row.width),
    height: numberOrNull(row.height),
    durationMs: numberOrNull(row.duration_ms),
    status: row.status,
    auditStatus: row.audit_status,
    expiresAt: toIsoString(row.expires_at),
    uploadedAt: toIsoString(row.uploaded_at),
    deletedAt: toIsoString(row.deleted_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('PostgreSQL client with query(sql, params) is required');
  }
}

function assertPendingDraft(draft) {
  const required = [
    'assetId',
    'ownerUserId',
    'provider',
    'bucket',
    'region',
    'objectKey',
    'purpose',
    'visibility',
    'contentType',
    'fileExtension',
    'declaredSizeBytes',
    'maxSizeBytes',
    'expiresAt',
    'createdAt',
  ];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing media asset draft fields: ${missing.join(', ')}`);
}

function positiveIntegerOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(value);
  return Number.isSafeInteger(normalized) && normalized > 0 ? normalized : null;
}

function normalizeProviderEtag(value) {
  const normalized = String(value || '').replace(/["\r\n]/g, '').trim();
  return normalized ? normalized.slice(0, 160) : null;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
}

function toIsoString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
