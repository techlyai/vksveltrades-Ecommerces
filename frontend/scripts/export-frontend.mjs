import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const destination = resolve(root, process.argv[2] || '.local/frontend-release');
if (existsSync(destination) && readdirSync(destination).some((name) => name !== '.git')) {
  throw new Error('Choose an empty directory or a newly cloned empty repository.');
}
mkdirSync(destination, { recursive: true });
const source = resolve(root, 'frontend');
for (const name of ['app', 'components', 'lib', 'public', 'tests', 'package.json', 'tsconfig.json', 'next-env.d.ts']) {
  cpSync(resolve(source, name), resolve(destination, name), { recursive: true, errorOnExist: true, force: false });
}
for (const name of ['Dockerfile', 'next.config.mjs', '.env.example', '.gitignore', '.dockerignore', 'README.md']) {
  cpSync(resolve(source, 'standalone', name), resolve(destination, name), { errorOnExist: true, force: false });
}
console.log(`Frontend prepared in ${destination}. Generate its standalone lockfile with npm install --package-lock-only.`);
