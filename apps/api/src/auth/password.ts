import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const derive = (password: string, salt: string): Promise<Buffer> => new Promise((resolve, reject) => {
  scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
    if (error) reject(error);
    else resolve(key);
  });
});

export async function hashPassword(password: string) {
  const salt = randomBytes(32).toString('hex');
  const key = await derive(password, salt);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, key, extra] = encoded.split('$');
  if (algorithm !== 'scrypt' || !/^[a-f0-9]{64}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(key || '') || extra !== undefined) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(key, 'hex'));
}

export function matchesBootstrapPassword(password: string, expected: string) {
  return timingSafeEqual(createHash('sha256').update(password).digest(), createHash('sha256').update(expected).digest());
}
