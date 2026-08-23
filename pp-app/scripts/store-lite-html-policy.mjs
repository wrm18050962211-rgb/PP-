export const STORE_LITE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'none'; worker-src 'self'";

export function assertStoreLiteHtmlPolicy(html, expectedScriptSource) {
  const source = String(html || '');
  const expected = String(expectedScriptSource || '');
  if (!expected || expected.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(expected)) {
    throw new Error('Store Lite HTML expected script source must be local.');
  }

  const openMarkers = [...source.matchAll(/<script\b/gi)];
  const openTags = [...source.matchAll(/<script\b[^>]*>/gi)];
  const closingTags = [...source.matchAll(/<\/script\s*>/gi)];
  if (openMarkers.length !== 1 || openTags.length !== 1 || closingTags.length !== 1) {
    throw new Error(`Store Lite HTML must contain exactly one script element, found ${openMarkers.length}.`);
  }

  const tag = openTags[0][0];
  if (readQuotedAttribute(tag, 'type')?.toLowerCase() !== 'module') {
    throw new Error('Store Lite HTML script must use quoted type="module".');
  }
  if (readQuotedAttribute(tag, 'src') !== expected) {
    throw new Error(`Store Lite HTML script must reference exactly ${expected}.`);
  }
  const openEnd = openTags[0].index + tag.length;
  const closingStart = closingTags[0].index;
  if (closingStart < openEnd || source.slice(openEnd, closingStart).trim()) {
    throw new Error('Store Lite HTML must not contain inline script content.');
  }
  if (/<base\b/i.test(source)) throw new Error('Store Lite HTML must not contain a base element.');

  const cspTags = [...source.matchAll(/<meta\b[^>]*>/gi)].filter(
    (match) => readQuotedAttribute(match[0], 'http-equiv')?.toLowerCase() === 'content-security-policy',
  );
  if (cspTags.length !== 1 || readQuotedAttribute(cspTags[0][0], 'content') !== STORE_LITE_CSP) {
    throw new Error('Store Lite HTML must contain the exact release Content-Security-Policy.');
  }
  if (cspTags[0].index > openTags[0].index) {
    throw new Error('Store Lite Content-Security-Policy must appear before the script element.');
  }
}
function readQuotedAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2];
}
