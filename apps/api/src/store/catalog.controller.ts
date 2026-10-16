import { StoreTransactionInterceptor } from './store-transaction.interceptor';
import { UseInterceptors, Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { StoreService } from './store.service';

@UseInterceptors(StoreTransactionInterceptor)
@Controller('catalog')
export class CatalogController {
  constructor(private readonly store: StoreService) {}
  @Get() all() { return this.store.catalog(); }
  @Get('categories') categories() { return this.store.categories.filter(item => item.enabled); }
  @Get('banners') banners() { return this.store.banners.filter(item => item.enabled !== false); }
  @Get('products') products() { return this.store.products.filter(item => item.enabled); }
  @Get('products/:id') product(@Param('id') id: string) { const product = this.store.products.find(item => item.id === id && item.enabled); if (!product) throw new NotFoundException('Product not found'); return product; }
}
