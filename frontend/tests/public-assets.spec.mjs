import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

test('all thirteen owner-provided banner images are bundled as JPEGs', () => {
  const names = ['finolex', 'astral', 'kundan', 'cera', 'pvc-taps', 'leo', 'roff', 'araldite', 'ramco', 'dulux', 'philips', 'surya', 'polycab'];
  for (const name of names) {
    const bytes = readFileSync(new URL(`../public/banners/${name}.jpeg`, import.meta.url));
    assert.equal(bytes.subarray(0, 3).toString('hex'), 'ffd8ff', name);
    assert.ok(bytes.length > 1000, name);
  }
});

test('production Docker runtime copies public images and service worker alongside Next assets', () => {
  for (const path of ['../Dockerfile', '../standalone/Dockerfile']) {
    const url = new URL(path, import.meta.url);
    if (!existsSync(url)) continue; // Standalone release has only the root Dockerfile.
    const dockerfile = readFileSync(url, 'utf8').split('AS runtime')[1];
    assert.match(dockerfile, /COPY --from=build --chown=node:node \/app\/(?:frontend\/)?public \.\/(?:frontend\/)?public/);
    assert.match(dockerfile, /\.next\/static/);
  }
});

test('tank image is bundled as an optimized WebP with real alpha transparency', () => {
  const image = readFileSync(new URL('../public/banners/astral-transparent.webp', import.meta.url));
  assert.equal(image.subarray(0, 4).toString(), 'RIFF');
  assert.equal(image.subarray(8, 12).toString(), 'WEBP');
  assert.equal(image.subarray(12, 16).toString(), 'VP8X');
  assert.ok(image[20] & 0x10, 'WebP must retain its alpha channel, not a painted background');
  assert.ok(image.length > 1000 && image.length < 100000);
});

test('favicon contains real 16, 32 and 48 pixel PNG images with matching directory entries', () => {
  const ico = readFileSync(new URL('../public/favicon.ico', import.meta.url));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  let offset = 54;
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
    assert.equal(ico.readUInt16LE(entry + 6), 32);
    assert.equal(ico.readUInt32LE(entry + 12), offset);
    const length = ico.readUInt32LE(entry + 8);
    const png = ico.subarray(offset, offset + length);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    if (size < 48) assert.deepEqual(png, readFileSync(new URL(`../public/brand/favicon-${size}.png`, import.meta.url)));
    offset += length;
  }
  assert.equal(offset, ico.length);
});

test('Apple touch icon has the required 180 pixel dimensions', () => {
  const png = readFileSync(new URL('../public/brand/apple-touch-icon.png', import.meta.url));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 180);
  assert.equal(png.readUInt32BE(20), 180);
});
