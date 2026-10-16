import { Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { uploadedSoundName } from './order-sound';

export const uploadedImageName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

@Injectable()
export class ImageStorage implements OnModuleInit, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const required = (name: string) => {
      const value = process.env[name];
      if (!value) throw new Error(`${name} is required; local upload storage is not supported`);
      return value;
    };
    const endpoint = new URL(required('S3_ENDPOINT'));
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error('Invalid S3_ENDPOINT');
    this.bucket = required('S3_BUCKET');
    this.client = new S3Client({
      endpoint: endpoint.href,
      region: process.env.S3_REGION || 'garage',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: { accessKeyId: required('S3_ACCESS_KEY_ID'), secretAccessKey: required('S3_SECRET_ACCESS_KEY') },
      maxAttempts: 2,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  async onModuleInit() { await this.health(); }

  async health() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), { abortSignal: AbortSignal.timeout(5000) });
    } catch {
      throw new ServiceUnavailableException('Image storage is unavailable');
    }
  }

  async put(name: string, bytes: Buffer) {
    if (!uploadedImageName.test(name)) throw new Error('Invalid uploaded image name');
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: `uploads/${name}`, Body: bytes,
        ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable',
      }), { abortSignal: AbortSignal.timeout(15000) });
    } catch {
      throw new ServiceUnavailableException('Image upload failed; please try again');
    }
  }

  async get(name: string): Promise<Buffer> {
    if (!uploadedImageName.test(name)) throw new NotFoundException();
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: `uploads/${name}` }),
        { abortSignal: AbortSignal.timeout(10000) });
      if (!result.Body) throw new Error('Empty image response');
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404) throw new NotFoundException('Image not found');
      throw new ServiceUnavailableException('Image storage is unavailable');
    }
  }

  async putSound(name: string, bytes: Buffer) {
    if (!uploadedSoundName.test(name)) throw new Error('Invalid uploaded sound name');
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket, Key: `order-sounds/${name}`, Body: bytes,
        ContentType: 'audio/wav', CacheControl: 'public, max-age=31536000, immutable',
      }), { abortSignal: AbortSignal.timeout(15000) });
    } catch { throw new ServiceUnavailableException('Sound upload failed; please try again'); }
  }

  async getSound(name: string): Promise<Buffer> {
    if (!uploadedSoundName.test(name)) throw new NotFoundException();
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: `order-sounds/${name}` }),
        { abortSignal: AbortSignal.timeout(10000) });
      if (!result.Body) throw new Error('Empty sound response');
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404)
        throw new NotFoundException('Sound not found');
      throw new ServiceUnavailableException('Sound storage is unavailable');
    }
  }

  onModuleDestroy() { this.client.destroy(); }
}
