import { readFileSync } from 'node:fs';

const sourceHtml = readFileSync(new URL('../store-lite-admin-entry/index.html', import.meta.url), 'utf8');

assertSourceHtml(sourceHtml);

const rejectionCases = [
  ['second-script', sourceHtml.replace('</body>', '<script type="module" src="/extra.js"></script></body>')],
  ['inline-script', sourceHtml.replace('></script>', '>window.bad = true;</script>')],
  ['unquoted-source', sourceHtml.replace('src="../src/store-lite-admin/main.tsx"', 'src=../src/store-lite-admin/main.tsx')],
  ['remote-source', sourceHtml.replace('../src/store-lite-admin/main.tsx', 'https://cdn.example.org/admin.js')],
  ['base-element', sourceHtml.replace('</head>', '<base href="/" /></head>')],
  ['loopback-csp', sourceHtml.replace("connect-src 'self' https:;", "connect-src 'self' https: http://127.0.0.1:8787;")],
  ['insecure-csp', sourceHtml.replace("connect-src 'self' https:;", "connect-src 'self' https: http://api.weareinframe.com;")],
];

for (const [name, html] of rejectionCases) {
  let rejected = false;
  try {
    assertSourceHtml(html);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(`Store Lite Admin source HTML policy accepted invalid case: ${name}.`);
}

console.log(JSON.stringify({ ok: true, rejectionCases: rejectionCases.map(([name]) => name) }, null, 2));

function assertSourceHtml(html) {
  assertSingleScript(html, '../src/store-lite-admin/main.tsx');
  assertProductionCsp(html);
  for (const forbidden of ['/src/main.tsx', 'storeLiteMain', 'AdminApp', 'AdminDashboard', 'SelectedApp']) {
    if (html.includes(forbidden)) throw new Error(`Store Lite Admin HTML references forbidden entry: ${forbidden}.`);
  }
}

function assertSingleScript(html, expectedSource) {
  const openMarkers = [...html.matchAll(/<script\b/gi)];
  const openTags = [...html.matchAll(/<script\b[^>]*>/gi)];
  const closingTags = [...html.matchAll(/<\/script\s*>/gi)];
  if (openMarkers.length !== 1 || openTags.length !== 1 || closingTags.length !== 1) {
    throw new Error(`Store Lite Admin HTML must contain exactly one script element, found ${openMarkers.length}.`);
  }
  if (/<base\b/i.test(html)) throw new Error('Store Lite Admin HTML must not contain a base element.');

  const tag = openTags[0][0];
  const attributes = parseAttributes(tag);
  if (attributes.size !== 2) throw new Error('Store Lite Admin source script may only contain type and src attributes.');
  if (attributes.get('type')?.value !== 'module' || !attributes.get('type')?.quoted) {
    throw new Error('Store Lite Admin source script must use quoted type="module".');
  }
  if (attributes.get('src')?.value !== expectedSource || !attributes.get('src')?.quoted) {
    throw new Error(`Store Lite Admin source script must use quoted src="${expectedSource}".`);
  }

  const openEnd = (openTags[0].index ?? 0) + tag.length;
  const closingStart = closingTags[0].index ?? -1;
  if (closingStart < openEnd || html.slice(openEnd, closingStart).trim()) {
    throw new Error('Store Lite Admin HTML must not contain inline script content.');
  }
}

function assertProductionCsp(html) {
  const policies = [...html.matchAll(
    /<meta\b[^>]*http-equiv\s*=\s*(["'])Content-Security-Policy\1[^>]*content\s*=\s*(["'])([\s\S]*?)\2[^>]*>/gi,
  )];
  if (policies.length !== 1) throw new Error('Store Lite Admin HTML must contain exactly one CSP meta element.');
  const policy = policies[0][3];
  if (!/\bconnect-src\s+'self'\s+https:\s*;/i.test(policy)) {
    throw new Error("Store Lite Admin production CSP must restrict connect-src to 'self' and HTTPS.");
  }
  if (/(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)/i.test(policy) || /\bhttp:/i.test(policy)) {
    throw new Error('Store Lite Admin production CSP contains an insecure or loopback endpoint.');
  }
}

function parseAttributes(tag) {
  const attributes = new Map();
  const source = tag.replace(/^<script\b/i, '').replace(/>$/, '');
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gy;
  let offset = 0;
  while (offset < source.length) {
    while (/\s/.test(source[offset] || '')) offset += 1;
    if (offset >= source.length) break;
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match || match.index !== offset) throw new Error('Store Lite Admin script contains malformed attributes.');
    const name = match[1].toLowerCase();
    if (attributes.has(name)) throw new Error(`Store Lite Admin script repeats ${name}.`);
    attributes.set(name, {
      value: match[2] ?? match[3] ?? match[4] ?? '',
      quoted: match[2] !== undefined || match[3] !== undefined,
    });
    offset = pattern.lastIndex;
  }
  return attributes;
}
