import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { PushSubscription } from 'web-push';

function key() {
  const value = process.env.PUSH_ENCRYPTION_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new ServiceUnavailableException('Push notifications are not configured');
  return Buffer.from(value, 'hex');
}
export function encryptSubscription(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}
export function decryptSubscription(value: string): { subscription: PushSubscription; token: string } {
  const data = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
}
export function validateSubscription(value: unknown): PushSubscription {
  const input = value as PushSubscription;
  let url: URL;
  try { url = new URL(input?.endpoint); } catch { throw new BadRequestException('Invalid push endpoint'); }
  // Browser push services only: never allow arbitrary backend HTTP requests.
  const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash
    || !allowed.includes(url.hostname) || input.endpoint.length > 2048) throw new BadRequestException('Unsupported push endpoint');
  for (const [field, length] of [['p256dh', 65], ['auth', 16]] as const) {
    const value = input.keys?.[field];
    if (typeof value !== 'string' || !/^[\w-]+={0,2}$/.test(value) || Buffer.from(value, 'base64url').length !== length)
      throw new BadRequestException('Invalid push encryption keys');
  }
  return { endpoint: url.href, keys: { p256dh: input.keys.p256dh, auth: input.keys.auth } };
}
