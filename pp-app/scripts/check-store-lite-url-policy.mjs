import { assertPublicHttpsUrl, assertStoreLiteApiOrigin } from './store-lite-url-policy.mjs';

const accepted = [
  ['https://api.weareinframe.com', { originOnly: true }],
  ['https://api.weareinframe.com:443/', { originOnly: true }],
  ['https://www.weareinframe.com/privacy', {}],
  ['https://www.weareinframe.com/support', {}],
  ['https://xn--fsqu00a.xn--0zwm56d/path', {}],
];

const rejected = [
  ['http://api.weareinframe.com', {}],
  ['https://user:secret@api.weareinframe.com', {}],
  ['https://api.weareinframe.com:444', {}],
  ['https://api.weareinframe.com?debug=1', {}],
  ['https://api.weareinframe.com/#debug', {}],
  ['https://api.weareinframe.com?', {}],
  ['https://api.weareinframe.com#', {}],
  ['https://api.weareinframe.com/v1', { originOnly: true }],
  ['https://localhost', {}],
  ['https://localhost.', {}],
  ['https://service.local.', {}],
  ['https://service.local', {}],
  ['https://service.internal', {}],
  ['https://service.home.arpa', {}],
  ['https://service.test', {}],
  ['https://api.example.com', {}],
  ['https://hidden-service.onion', {}],
  ['https://singlelabel', {}],
  ['https://127.0.0.1', {}],
  ['https://2130706433', {}],
  ['https://0x7f000001', {}],
  ['https://0.0.0.0', {}],
  ['https://10.0.0.1', {}],
  ['https://169.254.1.1', {}],
  ['https://192.168.1.10', {}],
  ['https://[::1]', {}],
  ['https://[::]', {}],
  ['https://[2001:4860:4860::8888]', {}],
  ['https://api.weareinframe.com.', {}],
  ['https://-api.weareinframe.com', {}],
  ['https://api_.weareinframe.com', {}],
];

const failures = [];
for (const [value, options] of accepted) {
  try {
    assertPublicHttpsUrl('TEST_URL', value, options);
  } catch (error) {
    failures.push(`expected acceptance for ${redactUrl(value)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

for (const [value, options] of rejected) {
  try {
    assertPublicHttpsUrl('TEST_URL', value, options);
    failures.push(`expected rejection for ${redactUrl(value)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('secret')) failures.push('URL policy error leaked URL credentials.');
  }
}

for (const value of ['https://api.weareinframe.com', 'https://api.weareinframe.com:443/']) {
  try {
    assertStoreLiteApiOrigin('VITE_API_BASE_URL', value);
  } catch (error) {
    failures.push(`expected approved API origin acceptance for ${value}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
for (const value of ['https://api.evil.org', 'https://www.weareinframe.com']) {
  try {
    assertStoreLiteApiOrigin('VITE_API_BASE_URL', value);
    failures.push(`expected unapproved API origin rejection for ${value}`);
  } catch {
    // Expected: Store Lite credentials may only be sent to the approved API origin.
  }
}

if (failures.length) {
  console.error('Store Lite URL policy check failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Store Lite URL policy check passed (${accepted.length} accepted, ${rejected.length} rejected).`);

function redactUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return `${parsed.protocol}//[credentials]@${parsed.host}${parsed.pathname}`;
  } catch {
    // The test description may safely use its static invalid input.
  }
  return value;
}
