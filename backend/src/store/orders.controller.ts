import { UseInterceptors, Body, Controller, Get, Param, Post, Query, Headers, Req, HttpException } from '@nestjs/common';
import { StoreTransactionInterceptor } from './store-transaction.interceptor';
import { PaymentReferenceDto, QuoteDto } from './dto';
import { StoreService } from './store.service';
import { authorizeOrder, customerOrder } from './order-access';

@UseInterceptors(StoreTransactionInterceptor)
@Controller('orders')
export class OrdersController {
  private readonly attempts = new Map<string, { at: number; count: number }>();
  constructor(private readonly store: StoreService) {}
  @Post('quote') quote(@Body() dto: QuoteDto) { return this.store.quote(dto); }
  @Post() create(@Body() dto: QuoteDto, @Headers('x-checkout-key') key?: string) { return this.store.createOrder(dto, key); }
  @Post(':id/cancel') cancel(@Param('id') id: string, @Headers('x-order-token') token: string) {
    authorizeOrder(this.store.getOrder(id), token);
    return customerOrder(this.store.cancelOrder(id));
  }
  @Post('lookup') list(@Body() dto: { credentials: Array<{ id: string; token: string }> }) {
    return this.store.customerOrders(dto?.credentials);
  }
  @Get(':id') track(@Param('id') id: string, @Query('phone') phone: string, @Headers('x-order-token') token: string, @Req() request: { ip: string }) {
    if (!token) {
      const now = Date.now();
      for (const [key, entry] of this.attempts) if (entry.at < now - 60000) this.attempts.delete(key);
      const entry = this.attempts.get(request.ip) || { at: now, count: 0 };
      if (++entry.count > 10 || this.attempts.size > 5000) throw new HttpException('Too many lookups. Please wait a minute.', 429);
      this.attempts.set(request.ip, entry);
    }
    return this.store.track(id, phone, token);
  }
  @Post(':id/payment-reference') reference(@Param('id') id: string, @Headers('x-order-token') token: string, @Body() dto: PaymentReferenceDto) {
    authorizeOrder(this.store.getOrder(id), token);
    return customerOrder(this.store.submitReference(id, dto.reference));
  }
}
