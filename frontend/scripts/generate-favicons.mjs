import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Format/size conversion only: use the exact shop logo without redrawing it.
const publicRoot = new URL('../public/', import.meta.url);
const source = fileURLToPath(new URL('brand/shop-logo.png', publicRoot));
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((size) => sharp(source)
  .resize(size, size, { fit: 'contain', background: '#ffffff' }).ensureAlpha().png().toBuffer()));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2); // ICO file, not CUR.
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
await writeFile(new URL('favicon.ico', publicRoot), Buffer.concat([directory, ...images]));
await Promise.all([16, 32].map((size, index) => writeFile(new URL(`brand/favicon-${size}.png`, publicRoot), images[index])));
await sharp(source)
  .resize(180, 180, { fit: 'contain', background: '#ffffff' }).png()
  .toFile(fileURLToPath(new URL('brand/apple-touch-icon.png', publicRoot)));
console.log('Generated VKS favicon.ico (16/32/48), PNG tab icons and 180px Apple touch icon.');
