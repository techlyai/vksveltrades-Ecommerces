import { BadRequestException } from '@nestjs/common';
import type { Shop } from './models';

export const soundUploadBytes = 3 * 1024 * 1024;
export const uploadedSoundName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.wav$/;
const soundUrl = /^\/api\/media\/order-sounds\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.wav$/;

// The browser decodes supported audio and sends this bounded, canonical PCM format.
// Validate the file itself again rather than trusting its extension or MIME type.
export function validateSoundWav(bytes: Buffer) {
  const invalid = () => { throw new BadRequestException('Choose a valid sound up to 15 seconds using the sound upload control.'); };
  if (bytes.length < 46 || bytes.length > soundUploadBytes) return invalid();
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
    || bytes.toString('ascii', 12, 16) !== 'fmt ' || bytes.readUInt32LE(16) !== 16
    || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(34) !== 16
    || bytes.toString('ascii', 36, 40) !== 'data' || bytes.readUInt32LE(4) !== bytes.length - 8) return invalid();
  const channels = bytes.readUInt16LE(22);
  const sampleRate = bytes.readUInt32LE(24);
  const blockAlign = bytes.readUInt16LE(32);
  const dataSize = bytes.readUInt32LE(40);
  if (![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 48000
    || blockAlign !== channels * 2 || bytes.readUInt32LE(28) !== sampleRate * blockAlign
    || dataSize !== bytes.length - 44 || dataSize % blockAlign !== 0
    || dataSize / (sampleRate * blockAlign) > 15) return invalid();
}

export function validateSoundSettings(patch: Partial<Shop>, current: Shop) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new BadRequestException('Choose valid shop settings.');
  if (patch.orderSoundEnabled !== undefined && typeof patch.orderSoundEnabled !== 'boolean')
    throw new BadRequestException('Order sound enabled must be true or false.');
  if (patch.orderSoundVolume !== undefined && (typeof patch.orderSoundVolume !== 'number'
    || !Number.isFinite(patch.orderSoundVolume) || patch.orderSoundVolume < 0 || patch.orderSoundVolume > 100))
    throw new BadRequestException('Order sound volume must be between 0 and 100.');
  if (patch.orderSound !== undefined && !['chime', 'bell', 'cash', 'ping', 'custom'].includes(patch.orderSound))
    throw new BadRequestException('Choose a valid order sound.');
  if (patch.orderSoundUrl !== undefined && (typeof patch.orderSoundUrl !== 'string'
    || (patch.orderSoundUrl !== '' && !soundUrl.test(patch.orderSoundUrl))))
    throw new BadRequestException('Choose a sound uploaded to this shop.');
  if ((patch.orderSound ?? current.orderSound) === 'custom' && !soundUrl.test(patch.orderSoundUrl ?? current.orderSoundUrl ?? ''))
    throw new BadRequestException('Upload a custom sound before selecting it.');
}
