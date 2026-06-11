import { buildStoreFromPostgresRows } from './postgresMappers.mjs';

export function createPostgresStore({ databaseUrl }) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required when STORE_DRIVER=postgres');
  }

  let poolPromise;

  return {
    kind: 'postgres',
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
    poolPromise ||= import('pg')
      .then(({ Pool }) => new Pool({ connectionString: databaseUrl }))
      .catch((error) => {
        throw new Error(`Install the "pg" package before using STORE_DRIVER=postgres. Original error: ${error.message}`);
      });
    return poolPromise;
  }
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
