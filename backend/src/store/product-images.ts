import { BadRequestException } from '@nestjs/common';
import type { Product } from './models';

// Keep the main-image alias for older clients and preserve empty optional slots.
export function normalizeProductImages(input: Partial<Product>, existing?: Product): Partial<Product> {
  const hasImages = Object.prototype.hasOwnProperty.call(input, 'imageUrls');
  const hasMain = Object.prototype.hasOwnProperty.call(input, 'imageUrl');
  if (existing && !hasImages && !hasMain) return {};
  const raw = hasImages ? input.imageUrls : [input.imageUrl, ...(existing?.imageUrls?.slice(1) ?? [])];
  if (!Array.isArray(raw) || raw.length > 4)
    throw new BadRequestException('Add up to 4 product images');
  if (!raw.length || typeof raw[0] !== 'string' || !raw[0].trim())
    throw new BadRequestException('Upload the main product image before saving');
  const images = raw.map((value, index) => {
    if (typeof value !== 'string') throw new BadRequestException('Product image URLs must be text');
    const url = value.trim();
    if (!url && index > 0) return '';
    if (url.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(url)
      || !/^(https?:\/\/|\/(?!\/))\S+$/i.test(url))
      throw new BadRequestException('Product images must use an http(s) URL or a local / path');
    return url;
  });
  while (images.length > 1 && !images[images.length - 1]) images.pop();
  return { imageUrls: images, imageUrl: images[0] };
}
