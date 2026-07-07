import { randomUUID } from 'node:crypto';
import { recordAdminActionTransaction, recordAuditLogTransaction } from './postgresAuditWrites.mjs';
import { upsertAuthIdentityUserTransaction } from './postgresAuthWrites.mjs';
import { buildStoreFromPostgresRows } from './postgresMappers.mjs';
import { sendMessageTransaction } from './postgresMessageWrites.mjs';
import { applyModerationActionTransaction, createReportTransaction } from './postgresModerationWrites.mjs';
import { createOrderTransaction, markPaymentPaidTransaction, transitionOrderTransaction } from './postgresOrderWrites.mjs';
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
      authWrites: true,
      writes: false,
      transactions: false,
      auditWrites: true,
      securityWrites: true,
      sessionWrites: true,
      orderWrites: true,
      messageWrites: true,
      moderationWrites: true,
    },
    authWrites: {
      upsertIdentityUser: (identity) => withClient((client) => upsertAuthIdentityUserTransaction(client, toAuthIdentityDraft(identity))),
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
      findByToken: (token) => withClient((client) => findSessionByToken(client, token)),
      touchToken: (token, seenAt) => withClient((client) => touchSessionTransaction(client, { tokenHash: hashSessionToken(token), seenAt })),
      revokeToken: (token, revokedAt) => withClient((client) => revokeSessionTransaction(client, { tokenHash: hashSessionToken(token), revokedAt })),
    },
    orderWrites: {
      createOrder: (draft) => withClient((client) => createOrderTransaction(client, draft)),
      markPaymentPaid: (draft) => withClient((client) => markPaymentPaidTransaction(client, draft)),
      transitionOrder: (draft) => withClient((client) => transitionOrderTransaction(client, draft)),
    },
    messageWrites: {
      sendMessage: (draft) => withClient((client) => sendMessageTransaction(client, draft)),
    },
    moderationWrites: {
      createReport: (draft) => withClient((client) => createReportTransaction(client, draft)),
      applyAction: (draft) => withClient((client) => applyModerationActionTransaction(client, draft)),
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

function toAuthIdentityDraft(identity = {}) {
  return {
    userId: identity.userId || cryptoRandomId(),
    identityId: identity.identityId || cryptoRandomId(),
    provider: identity.provider || 'wechat',
    providerUserId: identity.providerUserId || identity.openid || identity.openId,
    unionId: identity.unionId || identity.unionid || null,
    phone: identity.phone || null,
    nickname: identity.nickname || 'WeChat User',
    avatarUrl: identity.avatarUrl || identity.avatar_url || null,
    gender: identity.gender || 'unknown',
    city: identity.city || null,
    metadata: identity.metadata || {},
    loginAt: identity.loginAt,
  };
}

async function findSessionByToken(client, token) {
  const tokenHash = hashSessionToken(token);
  const result = await client.query(
    `select s.id as session_id,
            s.session_scope,
            s.user_id as session_user_id,
            s.admin_id as session_admin_id,
            s.companion_id as session_companion_id,
            s.role as session_role,
            s.provider,
            s.metadata,
            s.login_at,
            s.last_seen_at,
            s.expires_at,
            u.id as user_id,
            u.nickname,
            u.avatar_url,
            u.gender,
            u.city,
            u.status as user_status,
            u.is_companion,
            a.id as admin_id,
            a.username as admin_username,
            a.name as admin_name,
            a.role as admin_role,
            a.status as admin_status,
            coalesce(s.companion_id, c.id) as companion_id
     from user_sessions s
     left join users u on u.id = s.user_id
     left join admin_users a on a.id = s.admin_id
     left join companions c on c.user_id = u.id
     where s.token_hash = $1
       and s.revoked_at is null
       and s.expires_at > now()
     limit 1`,
    [tokenHash],
  );
  const row = result.rows?.[0];
  return row ? mapSessionRow(row, token) : null;
}

function mapSessionRow(row, token) {
  const metadata = normalizeJsonObject(row.metadata);
  const role = row.session_role || (row.session_scope === 'admin' ? 'admin' : 'consumer');
  const isAdmin = row.session_scope === 'admin' || role === 'admin';
  const user = isAdmin
    ? {
        id: row.admin_id,
        nickname: row.admin_name || row.admin_username || 'Admin',
        avatarUrl: '',
        gender: 'unknown',
        city: '',
        status: row.admin_status || 'active',
        roles: ['admin'],
      }
    : {
        id: row.user_id,
        nickname: row.nickname || 'User',
        avatarUrl: row.avatar_url || '',
        gender: row.gender || 'unknown',
        city: row.city || '',
        status: row.user_status || 'active',
        isCompanion: Boolean(row.is_companion),
        roles: metadata.roles || (role === 'companion' ? ['consumer', 'companion'] : ['consumer']),
      };

  return {
    id: row.session_id,
    token,
    provider: row.provider || null,
    role,
    roles: metadata.roles || (isAdmin ? ['consumer', 'companion', 'admin'] : role === 'companion' ? ['consumer', 'companion'] : ['consumer']),
    user,
    companionId: isAdmin ? null : row.companion_id || row.session_companion_id || null,
    adminId: isAdmin ? row.admin_id || row.session_admin_id || null : null,
    adminScope: isAdmin ? metadata.adminScope || ['audit', 'orders', 'risk', 'finance'] : [],
    mode: metadata.mode || null,
    loginAt: toIsoString(row.login_at),
    updatedAt: toIsoString(row.last_seen_at),
    expiresAt: toIsoString(row.expires_at),
  };
}

function normalizeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function toIsoString(value) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return String(value);
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
    orders,
    payments,
    conversations,
    messages,
    messageRiskEvents,
    reports,
    auditCases,
    auditLogs,
    adminActionLogs,
    securityEvents,
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
    queryRows(pool, `select * from orders order by created_at desc limit 100`),
    queryRows(pool, `select * from payments order by created_at desc limit 100`),
    queryRows(pool, `select * from conversations order by coalesce(last_message_at, updated_at, created_at) desc limit 100`),
    queryRows(
      pool,
      `select *
       from messages
       where conversation_id in (
         select id
         from conversations
         order by coalesce(last_message_at, updated_at, created_at) desc
         limit 100
       )
       order by sent_at asc
       limit 1000`,
    ),
    queryRows(pool, `select * from message_risk_events order by created_at desc limit 100`),
    queryRows(pool, `select * from reports order by created_at desc limit 100`),
    queryRows(pool, `select * from audit_cases order by submitted_at desc, created_at desc limit 100`),
    queryRows(pool, `select * from audit_logs order by created_at desc limit 100`),
    queryRows(pool, `select * from admin_action_logs order by created_at desc limit 100`),
    queryRows(pool, `select * from security_events order by created_at desc limit 100`),
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
    orders,
    payments,
    conversations,
    messages,
    messageRiskEvents,
    reports,
    auditCases,
    auditLogs,
    adminActionLogs,
    securityEvents,
  };
}

async function queryRows(pool, sql) {
  const result = await pool.query(sql);
  return result.rows;
}
