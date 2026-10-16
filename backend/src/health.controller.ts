import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { StoreDatabase } from './store/store.database';
import { ImageStorage } from './store/image-storage.service';

@Controller()
export class HealthController {
  constructor(private readonly database: StoreDatabase, private readonly storage: ImageStorage) {}
  @Get('health')
  async health() {
    try {
      await Promise.all([this.database.health(), this.storage.health()]);
      return { status: 'ok', database: 'postgresql', images: 'garage', service: 'vks-vel-traders-api', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException('Database or image storage is unavailable');
    }
  }
}
