import { randomUUID } from 'node:crypto';
import { recordAdminActionTransaction, recordAuditLogTransaction } from './postgresAuditWrites.mjs';
import { buildStoreFromPostgresRows } from './postgresMappers.mjs';
import { createSessionTransaction, revokeSessionTransaction, touchSessionTransaction } from './postgresSessionWrites.mjs';
import { recordSecurityEventTransaction } from './postgresSecurityWrites.mjs';
import { hashSessionToken } from './sessionTokenHash.mjs';

export function createPostgresStore({ databaseUrl, poolFactory } = {}) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required when STORE_DRIVER=postgres');
  }

  let poolPromise;

  return {
    kind: 'postgres',
    capabilities: {
      readModel: true,
      writes: false,
      transactions: false,
      auditWrites: true,
      securityWrites: true,
      sessionWrites: true,
    },
    auditWrites: {
      recordAuditLog: (draft) => withClient((client) => recordAuditLogTransaction(client, draft)),
      recordAdminAction: (draft) => withClient((client) => recordAdminActionTransaction(client, draft)),
    },
    securityWrites: {
      recordSecurityEvent: (draft) => withClient((client) => recordSecurityEventTransaction(client, draft)),
    },
    sessionWrites: {
      create: (session) => withClient((client) => createSessionTransaction(client, toSessionDraft(session))),
      touchToken: (token, seenAt) => withClient((client) => touchSessionTransaction(client, { tokenHash: hashSessionToken(token), seenAt })),
      revokeToken: (token, revokedAt) => withClient((client) => revokeSessionTransaction(client, { tokenHash: hashSessionToken(token), revokedAt })),
    },
    async load() {
      const pool = await getPool();
      const rows = await fetchReadModelRows(pool);
      return { store: buildStoreFromPostgresRows(rows), changed: false };
    },
    async save() {
      throw new Error('PostgreSQL store save is not implemented yet. Keep STORE_DRIVER=json for local write MVP until order/payment writes are moved to PostgreSQL.');
    },
  };

  async function getPool() {
    poolPromise ||= poolFactory
      ? Promise.resolve(poolFactory({ databaseUrl }))
      : import('pg')
          .then(({ Pool }) => new Pool({ connectionString: databaseUrl }))
          .catch((error) => {
            throw new Error(`Install the "pg" package before using STORE_DRIVER=postgres. Original error: ${error.message}`);
          });
    return poolPromise;
  }

  async function withClient(callback) {
    const pool = await getPool();
    const client = typeof pool.connect === 'function' ? await pool.connect() : pool;
    try {
      return await callback(client);
    } finally {
      client.release?.();
    }
  }
}

function toSessionDraft(session = {}) {
  const isAdmin = session.role === 'admin';
  const ownerId = session.adminId || session.user?.id;
  return {
    sessionId: session.id || session.sessionId || session.session_id || cryptoRandomId(),
    tokenHash: hashSessionToken(session.token),
    sessionScope: isAdmin ? 'admin' : 'user',
    userId: isAdmin ? null : ownerId,
    adminId: isAdmin ? ownerId : null,
    companionId: isAdmin ? null : session.companionId || null,
    role: session.role,
    provider: session.provider || null,
    deviceId: session.deviceId || null,
    ip: session.ip || null,
    userAgent: session.userAgent || null,
    metadata: {
      roles: session.roles || [],
      adminScope: session.adminScope || [],
      mode: session.mode || null,
    },
    loginAt: session.loginAt,
    lastSeenAt: session.updatedAt,
    expiresAt: session.expiresAt,
  };
}

function cryptoRandomId() {
  return randomUUID();
}

async function fetchReadModelRows(pool) {
  const [
    companions,
    companionTags,
    serviceAreas,
    activityPricings,
    companionExtras,
    availabilitySlots,
    posts,
    postImages,
    postTags,
  ] = await Promise.all([
    queryRows(pool, `select * from companions where status = 'approved' and service_enabled = true order by created_at desc limit 100`),
    queryRows(pool, `select * from companion_tags order by created_at asc`),
    queryRows(pool, `select * from service_areas where enabled = true order by created_at asc`),
    queryRows(pool, `select * from activity_pricings where enabled = true order by sort_order asc, created_at asc`),
    queryRows(pool, `select * from companion_extras where enabled = true order by created_at asc`),
    queryRows(pool, `select * from availability_slots where status in ('available', 'locked', 'booked', 'unavailable') order by start_at asc`),
    queryRows(pool, `select * from posts where status = 'approved' and is_feed_visible = true order by is_featured desc, published_at desc nulls last, created_at desc limit 100`),
    queryRows(pool, `select * from post_images where audit_status = 'approved' order by sort_order asc, created_at asc`),
    queryRows(pool, `select * from post_tags`),
  ]);

  return {
    companions,
    companionTags,
    serviceAreas,
    activityPricings,
    companionExtras,
    availabilitySlots,
    posts,
    postImages,
    postTags,
  };
}

async function queryRows(pool, sql) {
  const result = await pool.query(sql);
  return result.rows;
}
