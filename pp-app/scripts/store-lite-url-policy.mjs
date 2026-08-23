import { isIP } from 'node:net';

const RESERVED_HOST_SUFFIXES = [
  'example',
  'example.com',
  'example.net',
  'example.org',
  'home.arpa',
  'internal',
  'invalid',
  'lan',
  'local',
  'localhost',
  'onion',
  'test',
];

export const STORE_LITE_API_ORIGIN = 'https://api.weareinframe.com';

export function assertStoreLiteApiOrigin(name, value) {
  const parsed = assertPublicHttpsUrl(name, value, { originOnly: true });
  if (parsed.origin !== STORE_LITE_API_ORIGIN) {
    throw new Error(`${String(name || 'URL')} must use the approved Still API origin.`);
  }
  return parsed;
}

/**
 * Validate a public release URL without performing DNS resolution.
 *
 * The policy intentionally accepts only canonical, multi-label DNS names. Any
 * IP literal is rejected, including WHATWG-normalized decimal/hex IPv4 forms.
 */
export function assertPublicHttpsUrl(name, value, options = {}) {
  const label = String(name || 'URL');
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error(`${label} must be a valid public HTTPS URL.`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${label} must use HTTPS.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not contain credentials.`);
  }
  if (parsed.port && parsed.port !== '443') {
    throw new Error(`${label} must use the standard HTTPS port 443.`);
  }
  if (parsed.search || parsed.hash || parsed.href.includes('?') || parsed.href.includes('#')) {
    throw new Error(`${label} must not contain a query string or fragment.`);
  }
  if (options.originOnly && parsed.pathname !== '/') {
    throw new Error(`${label} must be an HTTPS origin without a path.`);
  }

  const rawHostname = parsed.hostname.toLowerCase();
  if (rawHostname.endsWith('.')) {
    throw new Error(`${label} must use a canonical hostname without a trailing dot.`);
  }
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']')
    ? rawHostname.slice(1, -1)
    : rawHostname;

  if (isIP(hostname)) {
    throw new Error(`${label} must use a public DNS hostname, not an IP address.`);
  }
  if (!hostname.includes('.')) {
    throw new Error(`${label} must use a multi-label public DNS hostname.`);
  }
  if (RESERVED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    throw new Error(`${label} must not use a reserved or private hostname suffix.`);
  }

  const labels = hostname.split('.');
  if (hostname.length > 253 || labels.some((part) => !isValidDnsLabel(part))) {
    throw new Error(`${label} must use a canonical public DNS hostname.`);
  }

  return parsed;
}

function isValidDnsLabel(value) {
  return value.length <= 63 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
}
