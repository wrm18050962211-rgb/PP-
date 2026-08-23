import { STORE_LITE_CSP, assertStoreLiteHtmlPolicy } from './store-lite-html-policy.mjs';

const sourceEntry = '../src/storeLiteMain.tsx';
const builtEntry = '/assets/index-release.js';
const csp = `<meta http-equiv="Content-Security-Policy" content="${STORE_LITE_CSP}" />`;
const validSource = `<!doctype html><html><head>${csp}<script type="module" src="${sourceEntry}"></script></head><body></body></html>`;
const validBuilt = `<!doctype html><html><head>${csp}<script type="module" crossorigin src="${builtEntry}"></script></head><body></body></html>`;

const failures = [];
expectAccepted('source entry', validSource, sourceEntry);
expectAccepted('built entry', validBuilt, builtEntry);

expectRejected('remote classic script', validBuilt.replace('</head>', '<script src="https://evil.invalid/x.js"></script></head>'), builtEntry);
expectRejected('unquoted module script', validBuilt.replace('type="module"', 'type=module'), builtEntry);
expectRejected('inline script', validBuilt.replace('></script>', '>alert(1)</script>'), builtEntry);
expectRejected('remote module replacement', validBuilt.replace(builtEntry, 'https://evil.invalid/x.js'), builtEntry);
expectRejected('missing CSP', validBuilt.replace(csp, ''), builtEntry);
expectRejected('weakened CSP', validBuilt.replace("script-src 'self'", "script-src 'self' https:"), builtEntry);
expectRejected('late CSP', validBuilt.replace(csp, '').replace('</head>', `${csp}</head>`), builtEntry);
expectRejected('base URL', validBuilt.replace('</head>', '<base href="https://evil.invalid/"></head>'), builtEntry);

if (failures.length) {
  console.error('Store Lite HTML policy check failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Store Lite HTML policy check passed (2 accepted, 8 rejected).');

function expectAccepted(name, html, expected) {
  try {
    assertStoreLiteHtmlPolicy(html, expected);
  } catch (error) {
    failures.push(`${name} should pass: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function expectRejected(name, html, expected) {
  try {
    assertStoreLiteHtmlPolicy(html, expected);
    failures.push(`${name} should be rejected.`);
  } catch {
    // Expected.
  }
}
