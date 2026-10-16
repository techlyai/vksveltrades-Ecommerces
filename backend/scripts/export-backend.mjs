import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const destination = resolve(root, process.argv[2] || '.local/backend-repository');
if (existsSync(destination) && readdirSync(destination).some((name) => name !== '.git')) {
  throw new Error('Choose an empty directory or a newly cloned empty repository. Existing files will not be overwritten.');
}
const source = resolve(root, 'backend');
const files = ['src', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json',
  'nest-cli.json', 'Dockerfile', '.dockerignore', '.gitignore', '.env.example',
  'compose.yaml', 'README.md'];
for (const name of files) {
  if (!existsSync(resolve(source, name))) throw new Error(`Missing backend file: ${name}`);
}
mkdirSync(destination, { recursive: true });
for (const name of files) cpSync(resolve(source, name), resolve(destination, name), { recursive: true, errorOnExist: true, force: false });
console.log(`Backend source prepared in ${destination}. No secrets, installed modules or store data were copied.`);
