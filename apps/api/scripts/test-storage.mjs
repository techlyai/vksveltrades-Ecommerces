// Tests use their own disposable PostgreSQL and Garage containers, never a user's DB.
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';

const id = `vks-test-${randomBytes(5).toString('hex')}`;
const directory = mkdtempSync(join(tmpdir(), `${id}-`));
const containers = [];
const password = randomBytes(24).toString('hex');
const accessKey = `GK${randomBytes(16).toString('hex')}`;
const secretKey = randomBytes(32).toString('hex');
const rpcSecret = randomBytes(32).toString('hex');
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function wait(check) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await check(); return; } catch { await delay(1000); }
  }
  throw new Error('Storage test container did not become ready');
}

async function waitForPostgres(port) {
  // The image's temporary init server can pass a Unix-socket pg_isready probe
  // before its final TCP listener is ready. Probe the same path tests will use.
  await wait(async () => {
    const client = new pg.Client({ host: '127.0.0.1', port: Number(port), user: 'vks', password, database: 'vks_test', connectionTimeoutMillis: 2000 });
    client.on('error', () => {});
    try { await client.connect(); await client.query('SELECT 1'); }
    finally { await client.end().catch(() => {}); }
  });
}

try {
  docker('info', '--format', '{{.ServerVersion}}');
  writeFileSync(join(directory, 'garage.toml'), `metadata_dir = "/meta"
data_dir = "/data"
db_engine = "sqlite"
replication_factor = 1
rpc_bind_addr = "0.0.0.0:3901"
rpc_public_addr = "127.0.0.1:3901"
[s3_api]
s3_region = "garage"
api_bind_addr = "0.0.0.0:3900"
`);
  for (const image of ['postgres:17-bookworm', 'dxflrs/garage:v2.4.1']) {
    try { docker('image', 'inspect', image); } catch { execFileSync('docker', ['pull', image], { stdio: 'inherit' }); }
  }
  containers.push(`${id}-postgres`);
  docker('run', '-d', '--name', containers[0], '--label', `vks.test=${id}`,
    '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'POSTGRES_USER=vks', '-e', 'POSTGRES_DB=vks_test',
    '-p', '127.0.0.1::5432', 'postgres:17-bookworm');
  containers.push(`${id}-garage`);
  docker('run', '-d', '--name', containers[1], '--label', `vks.test=${id}`,
    '--mount', `type=bind,source=${join(directory, 'garage.toml')},target=/etc/garage.toml,readonly`,
    '-e', `GARAGE_RPC_SECRET=${rpcSecret}`, '-e', `GARAGE_DEFAULT_ACCESS_KEY=${accessKey}`,
    '-e', `GARAGE_DEFAULT_SECRET_KEY=${secretKey}`, '-e', 'GARAGE_DEFAULT_BUCKET=vks-test',
    '-p', '127.0.0.1::3900', '--entrypoint', '/garage', 'dxflrs/garage:v2.4.1',
    'server', '--single-node', '--default-bucket');
  const pgPort = docker('port', containers[0], '5432/tcp').split(':').at(-1);
  const s3Port = docker('port', containers[1], '3900/tcp').split(':').at(-1);
  const endpoint = `http://127.0.0.1:${s3Port}`;
  await waitForPostgres(pgPort);
  const s3 = new S3Client({ endpoint, region: 'garage', forcePathStyle: true,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }, maxAttempts: 1 });
  try { await wait(() => s3.send(new HeadBucketCommand({ Bucket: 'vks-test' }))); } finally { s3.destroy(); }
  console.log('Testing against separate PostgreSQL and Garage containers.');
  const files = readdirSync(resolve('dist/store')).filter((file) => file.endsWith('.spec.js')).map((file) => resolve('dist/store', file));
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit', env: {
      ...process.env, DATABASE_URL: `postgresql://vks:${password}@127.0.0.1:${pgPort}/vks_test`,
      S3_ENDPOINT: endpoint, S3_REGION: 'garage', S3_BUCKET: 'vks-test',
      S3_ACCESS_KEY_ID: accessKey, S3_SECRET_ACCESS_KEY: secretKey, S3_FORCE_PATH_STYLE: 'true',
    } });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
  process.exitCode = code;
  if (code === 0) {
    const connectionString = `postgresql://vks:${password}@127.0.0.1:${pgPort}/vks_test`;
    const s3Options = { endpoint, region: 'garage', forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey }, maxAttempts: 1 };
    const beforeDb = new pg.Pool({ connectionString });
    const beforeStorage = new S3Client(s3Options);
    try {
      await beforeDb.query('CREATE TABLE container_restart_probe (value text NOT NULL)');
      await beforeDb.query('INSERT INTO container_restart_probe VALUES ($1)', [id]);
      await beforeStorage.send(new PutObjectCommand({ Bucket: 'vks-test', Key: 'restart-probe', Body: id }));
    } finally { await beforeDb.end(); beforeStorage.destroy(); }
    docker('restart', ...containers);
    // Docker can reassign automatically allocated host ports after restart.
    const restartedPgPort = docker('port', containers[0], '5432/tcp').split(':').at(-1);
    const restartedS3Port = docker('port', containers[1], '3900/tcp').split(':').at(-1);
    await waitForPostgres(restartedPgPort);
    const afterDb = new pg.Pool({ connectionString: `postgresql://vks:${password}@127.0.0.1:${restartedPgPort}/vks_test` });
    const afterStorage = new S3Client({ ...s3Options, endpoint: `http://127.0.0.1:${restartedS3Port}` });
    try {
      await wait(() => afterStorage.send(new HeadBucketCommand({ Bucket: 'vks-test' })));
      const saved = await afterDb.query('SELECT value FROM container_restart_probe');
      const object = await afterStorage.send(new GetObjectCommand({ Bucket: 'vks-test', Key: 'restart-probe' }));
      if (saved.rows[0]?.value !== id || await object.Body.transformToString() !== id) throw new Error('Container restart lost saved data');
      console.log('PostgreSQL and Garage data survived separate container restarts.');
    } finally { await afterDb.end(); afterStorage.destroy(); }
  }
} catch (error) {
  console.error('Storage tests failed:', error.message);
  for (const name of containers) {
    try { console.error(docker('logs', '--tail', '15', name)); } catch { /* container may not exist */ }
  }
  process.exitCode = 1;
} finally {
  for (const name of containers.reverse()) {
    try {
      if (docker('inspect', '--format', '{{index .Config.Labels "vks.test"}}', name) === id) docker('rm', '-f', '-v', name);
    } catch { /* no unrelated resources are removed */ }
  }
  rmSync(directory, { recursive: true, force: true });
}
