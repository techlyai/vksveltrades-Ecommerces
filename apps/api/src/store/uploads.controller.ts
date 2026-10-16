import { BadRequestException, Controller, Get, Header, Param, Post, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { AuthGuard } from '../auth/auth.guard';
import { ImageStorage } from './image-storage.service';
import { soundUploadBytes, validateSoundWav } from './order-sound';

const maxBytes = 5 * 1024 * 1024;

@Controller()
export class UploadsController {
  constructor(private readonly storage: ImageStorage) {}
  @Post('admin/uploads')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxBytes, files: 1, fields: 0 } }))
  async upload(@UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    if (!file?.buffer?.length || file.buffer.length > maxBytes)
      throw new BadRequestException('Choose an image up to 5 MB');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      throw new BadRequestException('Choose a JPEG, PNG or WebP image');
    let image: Buffer;
    try {
      const decoder = sharp(file.buffer, { limitInputPixels: 25_000_000, failOn: 'warning' });
      const metadata = await decoder.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1)
        throw new Error('Unsupported image');
      image = await decoder.rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
    } catch {
      throw new BadRequestException('The image is invalid or too large to process');
    }
    const name = `${randomUUID()}.webp`;
    await this.storage.put(name, image);
    return { url: `/api/media/uploads/${name}` };
  }

  @Get('media/uploads/:name')
  @Header('Content-Type', 'image/webp')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async image(@Param('name') name: string) {
    return new StreamableFile(await this.storage.get(name));
  }

  @Post('admin/order-sounds')
  @UseGuards(AuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: soundUploadBytes, files: 1, fields: 0 } }))
  async uploadSound(@UploadedFile() file?: { buffer: Buffer; mimetype: string }) {
    if (!file?.buffer?.length || !['audio/wav', 'audio/x-wav', 'audio/wave'].includes(file.mimetype))
      throw new BadRequestException('Choose a valid sound using the sound upload control.');
    validateSoundWav(file.buffer);
    const name = `${randomUUID()}.wav`;
    await this.storage.putSound(name, file.buffer);
    return { url: `/api/media/order-sounds/${name}` };
  }

  @Get('media/order-sounds/:name')
  @Header('Content-Type', 'audio/wav')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async sound(@Param('name') name: string) {
    return new StreamableFile(await this.storage.getSound(name));
  }
}
