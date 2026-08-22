import { randomUUID } from 'node:crypto';
import {
  createCompanionPostTransaction,
  getOwnCompanionProfile,
  getPublicCompanion,
  getPublicPost,
  getUserCollections,
  listPublicPosts,
  listUserCollection,
  setUserCollectionTransaction,
  submitCompanionPostReviewTransaction,
  updateCompanionProfileTransaction,
} from './postgresContentGateway.mjs';
import { recordAdminActionTransaction, recordAuditLogTransaction } from './postgresAuditWrites.mjs';
import { upsertAuthIdentityUserTransaction } from './postgresAuthWrites.mjs';
import { beginIdempotencyRequestTransaction, completeIdempotencyRequestTransaction, findIdempotencyRequest } from './postgresIdempotencyWrites.mjs';
import { buildStoreFromPostgresRows } from './postgresMappers.mjs';
import { sendMessageTransaction } from './postgresMessageWrites.mjs';
import { applyModerationActionTransaction, createReportTransaction, reviewAuditCaseTransaction } from './postgresModerationWrites.mjs';
import { getOrderDetailForActor, getOrderDetailForAdmin, listOrdersForActor } from './postgresOrderReads.mjs';
import { createOrderTransaction, expirePendingPaymentsTransaction, markPaymentPaidTransaction, markPaymentTerminalTransaction, markRefundTerminalTransaction, setAdminOrderStatusTransaction, transitionOrderTransaction } from './postgresOrderWrites.mjs';
import { issuePhoneVerificationChallengeTransaction, markPhoneVerificationFailedTransaction, markPhoneVerificationSentTransaction, verifyPhoneVerificationChallengeTransaction } from './postgresPhoneVerificationWrites.mjs';
import { claimDueProviderCallbacksTransaction, markProviderCallbackFailedTransaction, markProviderCallbackProcessedTransaction, recordProviderCallbackReceivedTransaction } from './postgresProviderCallbackWrites.mjs';
import { createSessionTransaction, revokeSessionTransaction, touchSessionTransaction } from './postgresSessionWrites.mjs';
import { recordSecurityEventTransaction } from './postgresSecurityWrites.mjs';
import { hashSessionToken } from './sessionTokenHash.mjs';

export function createPostgresStore({ databaseUrl, poolFactory, featureFlags = {} } = {}) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required when STORE_DRIVER=postgres');
  }

  const compositeOrderDomainEnabled = featureFlags.domainEnabled === true;
  const compositeOrderDomainOptions = Object.freeze({ compositeOrderDomainEnabled });
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
      idempotencyWrites: true,
      orderReads: true,
      orderWrites: true,
      messageWrites: true,
      moderationWrites: true,
      providerCallbackWrites: true,
      phoneVerificationWrites: true,
      contentReads: true,
      contentWrites: true,
      compositeOrderDomain: compositeOrderDomainEnabled,
      compositeOrderPayments: false,
    },
    content: {
      listPublicPosts: (options) => withClient((client) => listPublicPosts(client, options)),
      getPublicPost: (postId) => withClient((client) => getPublicPost(client, postId)),
      getPublicCompanion: (companionId) => withClient((client) => getPublicCompanion(client, companionId)),
      getOwnCompanionProfile: (draft) => withClient((client) => getOwnCompanionProfile(client, draft)),
      getUserCollections: (userId) => withClient((client) => getUserCollections(client, userId)),
      listUserCollection: (options) => withClient((client) => listUserCollection(client, options)),
      setUserCollection: (draft) => withClient((client) => setUserCollectionTransaction(client, draft)),
      updateCompanionProfile: (draft) => withClient((client) => updateCompanionProfileTransaction(client, draft)),
      createCompanionPost: (draft) => withClient((client) => createCompanionPostTransaction(client, draft)),
      submitCompanionPostReview: (draft) => withClient((client) => submitCompanionPostReviewTransaction(client, draft)),
    },
    authWrites: {
      upsertIdentityUser: (identity) => withClient((client) => upsertAuthIdentityUserTransaction(client, toAuthIdentityDraft(identity))),
    },
    phoneVerificationWrites: {
      issue: (draft) => withClient((client) => issuePhoneVerificationChallengeTransaction(client, draft)),
      markSent: (draft) => withClient((client) => markPhoneVerificationSentTransaction(client, draft)),
      markFailed: (draft) => withClient((client) => markPhoneVerificationFailedTransaction(client, draft)),
      verify: (draft) => withClient((client) => verifyPhoneVerificationChallengeTransaction(client, draft)),
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
    idempotencyWrites: {
      findRequest: (draft) => withClient((client) => findIdempotencyRequest(client, draft)),
      beginRequest: (draft) => withClient((client) => beginIdempotencyRequestTransaction(client, draft)),
      completeRequest: (draft) => withClient((client) => completeIdempotencyRequestTransaction(client, draft)),
    },
    orderReads: {
      listOrders: (options) =>
        withClient((client) =>
          listOrdersForActor(client, {
            ...options,
            includeServiceItems: compositeOrderDomainEnabled,
          }),
        ),
      getOrder: (options) =>
        withClient((client) =>
          getOrderDetailForActor(client, {
            ...options,
            includeServiceItems: compositeOrderDomainEnabled,
          }),
        ),
      getOrderForAdmin: (options) =>
        withClient((client) =>
          getOrderDetailForAdmin(client, {
            ...options,
            includeServiceItems: compositeOrderDomainEnabled,
          }),
        ),
    },
    orderWrites: {
      createOrder: (draft) =>
        withClient((client) =>
          createOrderTransaction(client, draft, {
            compositeOrderDomainEnabled,
            photographyItemId: compositeOrderDomainEnabled ? randomUUID() : undefined,
          }),
        ),
      markPaymentPaid: (draft) => withClient((client) => markPaymentPaidTransaction(client, draft, compositeOrderDomainOptions)),
      markPaymentTerminal: (draft) => withClient((client) => markPaymentTerminalTransaction(client, draft)),
      expirePendingPayments: (draft) => withClient((client) => expirePendingPaymentsTransaction(client, draft, compositeOrderDomainOptions)),
      markRefundTerminal: (draft) => withClient((client) => markRefundTerminalTransaction(client, draft, compositeOrderDomainOptions)),
      transitionOrder: (draft) => withClient((client) => transitionOrderTransaction(client, draft, compositeOrderDomainOptions)),
      setAdminOrderStatus: (draft) => withClient((client) => setAdminOrderStatusTransaction(client, draft, compositeOrderDomainOptions)),
    },
    messageWrites: {
      sendMessage: (draft) => withClient((client) => sendMessageTransaction(client, draft)),
    },
    moderationWrites: {
      createReport: (draft) => withClient((client) => createReportTransaction(client, draft)),
      applyAction: (draft) => withClient((client) => applyModerationActionTransaction(client, draft)),
      reviewAuditCase: (draft) => withClient((client) => reviewAuditCaseTransaction(client, draft)),
    },
    providerCallbackWrites: {
      recordReceived: (draft) => withClient((client) => recordProviderCallbackReceivedTransaction(client, draft)),
      claimDue: (draft) => withClient((client) => claimDueProviderCallbacksTransaction(client, draft)),
      markProcessed: (draft) => withClient((client) => markProviderCallbackProcessedTransaction(client, draft)),
      markFailed: (draft) => withClient((client) => markProviderCallbackFailedTransaction(client, draft)),
    },
    async load() {
      const pool = await getPool();
      const rows = await fetchReadModelRows(pool, { compositeOrderDomainEnabled });
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
            u.phone,
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
            coalesce(s.companion_id, c.id) as companion_id,
            c.status as companion_status
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
  if (!row || !isSessionPrincipalActive(row)) return null;
  return mapSessionRow(row, token);
}

function mapSessionRow(row, token) {
  const metadata = normalizeJsonObject(row.metadata);
  const role = row.session_role || (row.session_scope === 'admin' ? 'admin' : 'consumer');
  const isAdmin = row.session_scope === 'admin' || role === 'admin';
  const hasApprovedCompanion = Boolean(row.companion_id && row.companion_status === 'approved');
  const publicRoles = hasApprovedCompanion ? ['consumer', 'companion'] : ['consumer'];
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
        phone: row.phone || '',
        nickname: row.nickname || 'User',
        avatarUrl: row.avatar_url || '',
        gender: row.gender || 'unknown',
        city: row.city || '',
        status: row.user_status || 'active',
        isCompanion: hasApprovedCompanion,
        roles: publicRoles,
      };

  return {
    id: row.session_id,
    token,
    provider: row.provider || null,
    role,
    roles: isAdmin ? ['admin'] : publicRoles,
    user,
    companionId: isAdmin || !hasApprovedCompanion ? null : row.companion_id || row.session_companion_id || null,
    adminId: isAdmin ? row.admin_id || row.session_admin_id || null : null,
    adminScope: isAdmin ? metadata.adminScope || ['audit', 'orders', 'risk', 'finance'] : [],
    mode: metadata.mode || null,
    loginAt: toIsoString(row.login_at),
    updatedAt: toIsoString(row.last_seen_at),
    expiresAt: toIsoString(row.expires_at),
  };
}

function isSessionPrincipalActive(row) {
  const role = row.session_role || (row.session_scope === 'admin' ? 'admin' : 'consumer');
  const isAdmin = row.session_scope === 'admin' || role === 'admin';
  if (isAdmin) return Boolean(row.admin_id) && row.admin_status === 'active';
  if (!row.user_id || row.user_status !== 'active') return false;
  if (role === 'companion') {
    return Boolean(row.companion_id) && row.companion_status === 'approved';
  }
  return true;
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

async function fetchReadModelRows(pool, { compositeOrderDomainEnabled = false } = {}) {
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
    refunds,
    settlements,
    ledgerEntries,
    wallets,
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
    queryRows(pool, `select * from orders order by created_at desc, id desc limit 100`),
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
    queryRows(pool, `select * from refunds order by created_at desc limit 100`),
    queryRows(pool, `select * from settlements order by created_at desc limit 100`),
    queryRows(pool, `select * from ledger_entries order by created_at desc limit 100`),
    queryRows(pool, `select * from companion_wallets order by updated_at desc, created_at desc limit 100`),
    queryRows(pool, `select * from audit_logs order by created_at desc limit 100`),
    queryRows(pool, `select * from admin_action_logs order by created_at desc limit 100`),
    queryRows(pool, `select * from security_events order by created_at desc limit 100`),
  ]);

  let merchants = [];
  let merchantOfferings = [];
  let photographerMerchantLinks = [];
  let orderItems = [];

  if (compositeOrderDomainEnabled) {
    const orderIds = uniqueIds(orders.map((row) => row.id));
    const companionIds = uniqueIds(companions.map((row) => row.id));

    [orderItems, photographerMerchantLinks] = await Promise.all([
      orderIds.length > 0
        ? queryRows(
            pool,
            `select oi.*
             from order_items oi
             where oi.order_id = any($1::uuid[])
             order by oi.order_id, oi.item_no`,
            [orderIds],
          )
        : Promise.resolve([]),
      companionIds.length > 0
        ? queryRows(
            pool,
            `select *
             from photographer_merchant_links
             where companion_id = any($1::uuid[])
             order by created_at desc, id desc`,
            [companionIds],
          )
        : Promise.resolve([]),
    ]);

    const itemOrderIds = new Set(
      orderItems.filter((row) => row.service_type === 'photography').map((row) => String(row.order_id)),
    );
    const missingItemOrderIds = orderIds.filter((orderId) => !itemOrderIds.has(orderId));
    if (missingItemOrderIds.length > 0) {
      const error = new Error(
        `Composite order domain activation requires backfilling ${missingItemOrderIds.length} order(s). Run select backfill_missing_photography_order_items(); before enabling the flag.`,
      );
      error.code = 'COMPOSITE_ORDER_BACKFILL_REQUIRED';
      throw error;
    }

    const merchantIds = uniqueIds([
      ...orderItems.map((row) => row.provider_merchant_id),
      ...photographerMerchantLinks.map((row) => row.merchant_id),
    ]);
    const offeringIds = uniqueIds(orderItems.map((row) => row.merchant_offering_id));

    [merchants, merchantOfferings] = await Promise.all([
      merchantIds.length > 0
        ? queryRows(
            pool,
            `select id,
                    name,
                    status,
                    city,
                    address,
                    timezone,
                    business_hours,
                    (contact_phone is not null and btrim(contact_phone) <> '') as has_contact_phone,
                    contact_phone_visibility,
                    service_enabled,
                    created_at,
                    updated_at
             from merchants
             where id = any($1::uuid[])
             order by created_at desc, id desc`,
            [merchantIds],
          )
        : Promise.resolve([]),
      offeringIds.length > 0 || merchantIds.length > 0
        ? queryRows(
            pool,
            `select *
             from merchant_offerings
             where id = any($1::uuid[])
                or (merchant_id = any($2::uuid[]) and enabled = true)
             order by merchant_id, offering_code, version desc`,
            [offeringIds, merchantIds],
          )
        : Promise.resolve([]),
    ]);
  }

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
    refunds,
    settlements,
    ledgerEntries,
    wallets,
    auditLogs,
    adminActionLogs,
    securityEvents,
    merchants,
    merchantOfferings,
    photographerMerchantLinks,
    orderItems,
  };
}

async function queryRows(pool, sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value)))];
}
