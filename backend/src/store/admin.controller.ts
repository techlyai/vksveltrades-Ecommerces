import { StoreTransactionInterceptor } from './store-transaction.interceptor';
import { UseInterceptors, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { UpdateOrderDto } from './dto';
import { Banner, Category, CustomerCategory, DeliveryRule, Order, OrderStatus, PaymentStatus, Product, Shop } from './models';
import { StoreService } from './store.service';

@UseGuards(AuthGuard)
@UseInterceptors(StoreTransactionInterceptor)
@Controller('admin')
export class AdminController {
  constructor(private readonly store: StoreService) {}
  @Get('dashboard') dashboard() { return this.store.dashboard(); }
  @Get('order-alerts') orderAlerts() { this.store.sweepExpired(); return this.store.orderAlerts(); }
  @Get('customers') customers() { return this.store.customers(); }
  @Get('orders') orders(@Query('includeArchived') includeArchived?: string) { this.store.sweepExpired(); return this.store.adminOrders(includeArchived === 'true'); }
  @Put('orders/archive') archiveOrders(@Body() dto: unknown) { return this.store.archiveOrders(dto); }
  @Get('orders/:id') order(@Param('id') id: string) { return this.store.getOrder(id); }
  @Patch('orders/:id/status') status(@Param('id') id: string, @Body() dto: UpdateOrderDto) { return this.store.updateStatus(id, dto.status as OrderStatus); }
  @Put('orders/:id/payment') payment(@Param('id') id: string, @Body() dto: { status: PaymentStatus; reference?: string }) { return this.store.updatePayment(id, dto.status, dto.reference); }
  @Post('orders/:id/verify-payment') verify(@Param('id') id: string) { return this.store.updatePayment(id, 'PAID'); }
  @Put('orders/:id/shipment') shipment(@Param('id') id: string, @Body() dto: Order['shipment']) { return this.store.updateShipment(id, dto); }
  @Get('products') products() { return this.store.products; }
  @Get('paint-shades') paintShades() { return this.store.paintShades; }
  @Post('paint-shades') createPaintShade(@Body() dto: unknown) { return this.store.createPaintShade(dto); }
  @Patch('paint-shades/:id') updatePaintShade(@Param('id') id: string, @Body() dto: unknown) { return this.store.updatePaintShade(id, dto); }
  @Post('products') createProduct(@Body() dto: Partial<Product>) { return this.store.createProduct(dto); }
  @Patch('products/:id') updateProduct(@Param('id') id: string, @Body() dto: Partial<Product>) { return this.store.updateProduct(id, dto); }
  @Put('products/:id/colors') updateProductColors(@Param('id') id: string, @Body() dto: unknown) { return this.store.updateProductColors(id, dto); }
  @Put('products/:id/stock') stock(@Param('id') id: string, @Body() dto: { quantity: number; variantId?: string }) { return this.store.adjustStock(id, dto.quantity, dto.variantId); }
  @Delete('products/:id') deleteProduct(@Param('id') id: string) { return this.store.deleteProduct(id); }
  @Get('categories') categories() { return this.store.categories; }
  @Post('categories/import-shop') importShopCategories() { return this.store.importShopCategories(); }
  @Post('categories') createCategory(@Body() dto: Partial<Category>) { return this.store.createCategory(dto); }
  @Patch('categories/:id') updateCategory(@Param('id') id: string, @Body() dto: Partial<Category>) { return this.store.updateCategory(id, dto); }
  @Delete('categories/:id') deleteCategory(@Param('id') id: string) { return this.store.deleteCategory(id); }
  @Get('banners') banners() { return this.store.banners; }
  @Post('banners') createBanner(@Body() dto: Partial<Banner>) { return this.store.createBanner(dto); }
  @Patch('banners/:id') updateBanner(@Param('id') id: string, @Body() dto: Partial<Banner>) { return this.store.updateBanner(id, dto); }
  @Delete('banners/:id') deleteBanner(@Param('id') id: string) { return this.store.deleteBanner(id); }
  @Get('delivery-rules') deliveryRules() { return this.store.deliveryRules; }
  @Post('delivery-rules') createDeliveryRule(@Body() dto: Partial<DeliveryRule>) { return this.store.createDeliveryRule(dto); }
  @Patch('delivery-rules/:id') updateDeliveryRule(@Param('id') id: string, @Body() dto: Partial<DeliveryRule>) { return this.store.updateDeliveryRule(id, dto); }
  @Delete('delivery-rules/:id') deleteDeliveryRule(@Param('id') id: string) { return this.store.deleteDeliveryRule(id); }
  @Get('customer-categories') customerCategories() { return this.store.customerCategories; }
  @Post('customer-categories') createCustomerCategory(@Body() dto: Partial<CustomerCategory>) { return this.store.createCustomerCategory(dto); }
  @Patch('customer-categories/:id') updateCustomerCategory(@Param('id') id: string, @Body() dto: Partial<CustomerCategory>) { return this.store.updateCustomerCategory(id, dto); }
  @Delete('customer-categories/:id') deleteCustomerCategory(@Param('id') id: string) { return this.store.deleteCustomerCategory(id); }
  @Get('configuration') configuration() { return this.store.configuration(); }
  @Patch('configuration/shop') updateShop(@Body() dto: Partial<Shop>) { return this.store.updateShop(dto); }
}
