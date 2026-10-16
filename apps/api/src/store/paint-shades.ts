import { BadRequestException } from '@nestjs/common';
import type { PaintShade } from './models';

export const normalizeShadeCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '');

export function validatePaintShade(input: unknown, id: string, existing: PaintShade[]): PaintShade {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid paint shade');
  const data = input as Record<string, unknown>;
  const text = (key: string, max: number) => {
    const value = data[key];
    if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
      throw new BadRequestException(`Shade ${key} is required and must be no more than ${max} characters`);
    return value.trim();
  };
  const code = text('code', 30), name = text('name', 50), brand = text('brand', 30), family = text('family', 50);
  if (!/^[a-z0-9#][a-z0-9 .#/_-]*$/i.test(code) || !normalizeShadeCode(code)) throw new BadRequestException('Use letters and numbers for the shade code');
  if (`${brand} / ${code} / ${name}`.length > 80) throw new BadRequestException('Brand, shade code and name together must fit within 80 characters');
  if (existing.some((shade) => shade.id !== id && normalizeShadeCode(shade.code) === normalizeShadeCode(code)))
    throw new BadRequestException('This shade number / code already exists');
  if (typeof data.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(data.color)) throw new BadRequestException('Choose a valid shade preview color');
  if (typeof data.enabled !== 'boolean') throw new BadRequestException('Shade visibility must be true or false');
  if (data.imageUrl !== undefined && data.imageUrl !== '' && (typeof data.imageUrl !== 'string'
    || !/^\/api\/media\/uploads\/[a-f0-9-]{36}\.webp$/.test(data.imageUrl))) throw new BadRequestException('Upload a shade image using the image upload control');
  return { id, code, name, brand, family, color: data.color.toLowerCase(), enabled: data.enabled,
    ...(data.imageUrl ? { imageUrl: data.imageUrl as string } : {}) };
}
