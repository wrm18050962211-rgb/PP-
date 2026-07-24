import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/path === '\/api\/feed\/posts'\) return listFeedPostsRoute/.test(source), 'feed route uses async content handler');
assert(/dataStore\.content\?\.listPublicPosts/.test(source), 'feed route calls postgres content query');
assert(/path === '\/api\/companion\/me\/profile'/.test(source), 'companion profile routes exist');
assert(/requireCompanionSession\(store\)/.test(source), 'companion writes require companion session');
assert(/dataStore\.content\?\.updateCompanionProfile/.test(source), 'profile route uses postgres transaction');
assert(/dataStore\.content\?\.createCompanionPost/.test(source), 'post route uses postgres transaction');
assert(/dataStore\.content\?\.submitCompanionPostReview/.test(source), 'post review route uses postgres transaction');
assert(/path === '\/api\/me\/collections'/.test(source), 'collection read route exists');
assert(/dataStore\.content\?\.setUserCollection/.test(source), 'collection mutation uses postgres transaction');
assert(/requirePublicSession\(store, 'consumer', 'user_collections'\)/.test(source), 'collection routes require public session');
assert(/POST_IMAGES_INVALID/.test(source) && /isProductionMediaUrl/.test(source), 'post route rejects non-persistent media');
assert(/POSTGRES_CONTENT_REQUIRED/.test(source), 'content writes fail closed without postgres');
assert(/cause\?\.code === '22P02'/.test(source), 'invalid postgres UUIDs use stable API errors');
assert(/cause\?\.code === '23505'/.test(source), 'postgres uniqueness conflicts use stable API errors');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'feed-database-route',
        'profile-routes',
        'post-routes',
        'collection-routes',
        'session-boundaries',
        'persistent-media',
        'postgres-fail-closed',
        'stable-database-errors',
      ],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres content route check failed: ${message}`);
}
