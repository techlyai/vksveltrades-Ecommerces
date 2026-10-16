import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { OrderNotifications } from './order-notifications.service';

@Controller('push')
export class PushController {
  constructor(private readonly notifications: OrderNotifications) {}
  @Get('config') config() { return this.notifications.config(); }
  @Post('orders/:id') subscribe(@Param('id') id: string, @Headers('x-order-token') token: string, @Body() body: unknown) {
    return this.notifications.subscribe(id, token, body);
  }
  @Delete('orders/:id') unsubscribe(@Param('id') id: string, @Headers('x-order-token') token: string, @Body() body: { endpoint: string }) {
    return this.notifications.unsubscribe(id, token, body?.endpoint);
  }
}
