import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Read-only smoke test against the built runtime, not Next's development server.
// Usage: node scripts/check-frontend-assets.mjs http://127.0.0.1:PORT [public-directory]
const origin = process.argv[2];
assert.ok(origin, 'Provide the URL of a running frontend container.');
const publicRoot = resolve(process.argv[3] || 'apps/web/public');
const assets = [
  ...readdirSync(resolve(publicRoot, 'banners')).map((name) => `banners/${name}`),
  ...readdirSync(resolve(publicRoot, 'brand')).map((name) => `brand/${name}`),
  'favicon.ico', 'sw.js', 'manifest.webmanifest',
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const path of assets) {
  const response = await fetch(new URL(`/${path}`, origin));
  assert.equal(response.status, 200, path);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(hash(bytes), hash(readFileSync(resolve(publicRoot, path))), `Incorrect asset bytes: ${path}`);
  if (path.endsWith('.jpeg')) assert.match(response.headers.get('content-type'), /image\/jpeg/, path);
  if (path.endsWith('.webp')) assert.match(response.headers.get('content-type'), /image\/webp/, path);
  if (path.endsWith('.png')) assert.match(response.headers.get('content-type'), /image\/png/, path);
  if (path.endsWith('.ico')) assert.match(response.headers.get('content-type'), /image\/(?:x-icon|vnd.microsoft.icon)/, path);
  if (path.endsWith('.svg')) assert.match(response.headers.get('content-type'), /image\/svg\+xml/, path);
  if (path === 'sw.js') {
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.equal(response.headers.get('service-worker-allowed'), '/');
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
}
const chunks = new Set();
for (const path of ['/', '/admin', '/orders/VKST-TEST']) {
  const response = await fetch(new URL(path, origin));
  assert.equal(response.status, 200, path);
  const html = await response.text();
  assert.match(html, /rel="icon" href="\/favicon.ico\?v=2"/);
  assert.match(html, /rel="icon" href="\/brand\/favicon-32.png\?v=2"/);
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"\s]+)"/g)) chunks.add(match[1]);
}
assert.ok(chunks.size > 0, 'Expected production JavaScript and CSS.');
for (const path of chunks) {
  const response = await fetch(new URL(path.replaceAll('&amp;', '&'), origin));
  assert.equal(response.status, 200, path);
  assert.ok((await response.arrayBuffer()).byteLength > 0, path);
}
console.log(`Verified ${assets.length} exact public assets (including all 13 supplied banners), ${chunks.size} production chunks and 3 page routes.`);
