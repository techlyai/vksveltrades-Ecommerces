import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { authorizeOrder, customerOrder, hashToken } from './order-access';
import { CartItemDto, CustomerDto, QuoteDto } from './dto';
import { Banner, Category, CustomerCategory, DeliveryRule, Order, OrderItem, OrderStatus, PaymentStatus, PaintShade, Product, Shop } from './models';
import { defaultPaintShades } from './paint-shade-defaults';
import { validatePaintShade } from './paint-shades';
import { normalizeProductImages } from './product-images';
import { StoreDatabase } from './store.database';
import { shopCategories } from './shop-categories';
import { validateCustomer } from './customer-validation';
import { checkoutTiers } from './checkout-tiers';
import { normalizePaymentStatus } from './payment-status';
import { validateSoundSettings } from './order-sound';
import { bannerThemes } from './supplied-banners';

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);
  constructor(private readonly database: StoreDatabase) {}

  get categories() { return this.database.state.categories; }
  get products() { return this.database.state.products; }
  get customerCategories() { return this.database.state.customerCategories; }
  get deliveryRules() { return this.database.state.deliveryRules; }
  get banners() { return this.database.state.banners; }
  get shop() { return this.database.state.shop; }
  get paintShades(): PaintShade[] { return this.shop.paintShades ?? structuredClone(defaultPaintShades); }
  get orders() { return this.database.state.orders; }

  private persist() { this.database.markChanged(); }

  catalog() {
    this.sweepExpired();
    return {
      shop: this.publicShop(),
      paintShades: this.paintShades.filter((shade) => shade.enabled),
      categories: this.categories.filter((x) => x.enabled),
      products: this.products.filter((x) => x.enabled),
      banners: this.banners
        .filter((x) => x.enabled !== false)
        .sort((a, b) => (a.order || 0) - (b.order || 0)),
      customerCategories: checkoutTiers(this.customerCategories),
    };
  }
  publicShop() {
    const {
      upiId,
      merchantCategoryCode,
      merchantReference,
      terminalId,
      orderSoundEnabled,
      orderSound,
      orderSoundVolume,
      orderSoundUrl,
      paintShades,
      lastOrderNumber,
      ...safe
    } = this.shop;
    return { ...safe, upiEnabled: Boolean(upiId?.trim()) };
  }
  paymentConfig() {
    return { upiId: this.shop.upiId, payeeName: this.shop.payeeName };
  }
  delivery(customer: CustomerDto) {
    const text =
      `${customer.area} ${customer.city} ${customer.district}`.toLowerCase();
    const custom = this.deliveryRules.find((rule) =>
      text.includes(rule.match.toLowerCase()),
    );
    if (custom) return custom.charge;
    if (this.shop.maduraiFree && (/madurai/i.test(text) || /^6250\d\d$/.test(customer.pincode))) return 0;
    if (!/tamil\s*nadu|^tn$/i.test(customer.state))
      return this.shop.outsideTamilNaduCharge;
    return this.shop.defaultDeliveryCharge;
  }

  resolve(lines: CartItemDto[]): OrderItem[] {
    if (!Array.isArray(lines) || lines.length > 100) throw new BadRequestException('Invalid cart');
    const combined = new Map<string, CartItemDto>();
    const stockQuantities = new Map<string, number>();
    for (const line of lines) {
      if (!line || typeof line.productId !== 'string' || !Number.isSafeInteger(line.quantity) || line.quantity < 1)
        throw new BadRequestException('Invalid cart item');
      if (line.variantId !== undefined && typeof line.variantId !== 'string')
        throw new BadRequestException('Invalid color selection');
      if (line.customShadeCode !== undefined && (typeof line.customShadeCode !== 'string'
        || line.customShadeCode.length > 80 || /[\u0000-\u001f\u007f]/.test(line.customShadeCode)))
        throw new BadRequestException('Custom shade code must be text of up to 80 characters');
      const customShadeCode = line.customShadeCode?.trim() || undefined;
      const stockKey = JSON.stringify([line.productId, line.variantId || '']);
      const stockQuantity = (stockQuantities.get(stockKey) || 0) + line.quantity;
      if (!Number.isSafeInteger(stockQuantity)) throw new BadRequestException('Invalid quantity');
      stockQuantities.set(stockKey, stockQuantity);
      const key = JSON.stringify([line.productId, line.variantId || '', customShadeCode || '']);
      const quantity = (combined.get(key)?.quantity || 0) + line.quantity;
      if (!Number.isSafeInteger(quantity)) throw new BadRequestException('Invalid quantity');
      combined.set(key, { ...line, customShadeCode, quantity });
    }
    return [...combined.values()].map((line) => {
      if (
        !line.productId ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1
      )
        throw new BadRequestException('Invalid cart item');
      const product = this.products.find((x) => x.id === line.productId);
      if (!product?.enabled || product.manualOutOfStock)
        throw new BadRequestException('A product is unavailable');
      if (line.customShadeCode && !(product.customShadeEnabled ?? product.categoryId === 'paints'))
        throw new BadRequestException(`Custom shades are not available for ${product.name}`);
      const variant = product.variants?.find((x) => x.id === line.variantId);
      if (product.variants?.length && !line.variantId)
        throw new BadRequestException(`Choose a color for ${product.name}`);
      if (line.variantId && !variant)
        throw new BadRequestException(`Invalid variant for ${product.name}`);
      const stock = variant?.stock ?? product.stock;
      if (stockQuantities.get(JSON.stringify([line.productId, line.variantId || '']))! > stock)
        throw new BadRequestException(
          `Only ${stock} units of ${product.name} are available`,
        );
      const price = variant?.price ?? product.price;
      if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(Math.round(price * 100)))
        throw new BadRequestException(`Invalid price for ${product.name}`);
      return {
        productId: product.id,
        variantId: variant?.id,
        name: product.name,
        price: Math.round(price * 100) / 100,
        quantity: line.quantity,
        hsn: product.hsn,
        shade: variant?.name || product.colorName || undefined,
        color: variant?.color,
        ...(line.customShadeCode ? { customShadeCode: line.customShadeCode } : {}),
      };
    });
  }

  quote(dto: QuoteDto) {
    this.sweepExpired();
    if (!dto?.items?.length)
      throw new BadRequestException('Cart and customer details are required');
    const fields = validateCustomer(dto.customer);
    if (Object.keys(fields).length) throw new BadRequestException({ message: 'Please correct the highlighted customer details.', fields });
    const c = Object.fromEntries(Object.entries(dto.customer).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as CustomerDto;
    const items = this.resolve(dto.items);
    // Work in paise so the receipt, discount and UPI amount agree to two decimals.
    const subtotalPaise = items.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);
    if (!Number.isSafeInteger(subtotalPaise)) throw new BadRequestException('Invalid cart total');
    const subtotal = subtotalPaise / 100;
    if (subtotal < this.shop.minimumOrder)
      throw new BadRequestException(
        `Minimum order is ₹${this.shop.minimumOrder}`,
      );
    const tier = typeof dto.customerCategoryId === 'string'
      ? checkoutTiers(this.customerCategories).find((category) => category.id === dto.customerCategoryId) : undefined;
    if (!tier) throw new BadRequestException('Choose a valid Customer Type.');
    const rate = tier.id === 'customer' ? 0 : tier.discountPercent;
    const minimum = tier.id === 'customer' ? 0 : tier.minimum;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100 || !Number.isFinite(minimum) || minimum < 0)
      throw new BadRequestException('Customer Type discount settings are invalid.');
    const discountPercent = subtotalPaise > Math.round(minimum * 100) ? rate : 0;
    // Exactly one tier discount, calculated from server product/variant prices.
    const discountPaise = Math.round(subtotalPaise * discountPercent / 100);
    const discount = discountPaise / 100;
    const deliveryPaise = Math.round(this.delivery(c) * 100);
    if (!Number.isSafeInteger(deliveryPaise) || deliveryPaise < 0) throw new BadRequestException('Invalid delivery charge');
    const delivery = deliveryPaise / 100;
    const taxable = subtotal - discount;
    const gstRate = this.shop.gstRate;
    const gstInclusive = this.shop.gstInclusive;
    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100 || typeof gstInclusive !== 'boolean')
      throw new BadRequestException('GST settings are invalid');
    const gstPaise = Math.round(gstInclusive
      ? (taxable - taxable / (1 + gstRate / 100)) * 100
      : (subtotalPaise - discountPaise) * gstRate / 100);
    const totalPaise = subtotalPaise - discountPaise + deliveryPaise + (gstInclusive ? 0 : gstPaise);
    if (!Number.isSafeInteger(totalPaise) || totalPaise < 0) throw new BadRequestException('Invalid order total');
    const gst = gstPaise / 100;
    return {
      items,
      subtotal,
      discount,
      discountPercent,
      discountRate: rate,
      discountMinimum: minimum,
      delivery,
      gst,
      gstRate,
      gstInclusive,
      total: totalPaise / 100,
      customerCategory: tier.name,
      customerCategoryId: tier.id,
    };
  }

  createOrder(dto: QuoteDto, key?: string) {
    if (key !== undefined && !/^[a-f0-9]{64}$/.test(key)) throw new BadRequestException('Invalid checkout key');
    if (key) {
      const existing = this.orders.find((order) => order.trackingHash === hashToken(key));
      if (existing) return { ...customerOrder(existing), trackingToken: key, paymentConfig: this.paymentConfig() };
    }
    const q = this.quote(dto);
    const next =
      Math.max(
        1000,
        this.shop.lastOrderNumber || 1000,
        ...this.orders.map((o) => Number(o.id.replace(/\D/g, '')) || 1000),
      ) + 1;
    const now = new Date();
    const trackingToken = key || randomBytes(32).toString('hex');
    const order: Order = {
      trackingHash: hashToken(trackingToken), statusVersion: 1,
      checkoutSession: true,
      history: [{ status: 'Pending Payment', at: now.toISOString() }],
      id: `VKST-${next}`,
      createdAt: now.toISOString(),
      customer: Object.fromEntries(Object.entries(dto.customer).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as CustomerDto,
      customerCategory: q.customerCategory,
      customerCategoryId: q.customerCategoryId,
      items: q.items,
      subtotal: q.subtotal,
      discount: q.discount,
      discountPercent: q.discountPercent,
      delivery: q.delivery,
      gst: q.gst,
      gstRate: q.gstRate,
      gstInclusive: q.gstInclusive,
      total: q.total,
      status: 'Pending Payment',
      payment: {
        status: 'UNPAID',
        method: 'UPI',
        expiresAt: new Date(
          now.getTime() + this.shop.paymentWindowMinutes * 60000,
        ).toISOString(),
      },
    };
    this.reserve(order.items);
    this.shop.lastOrderNumber = next;
    this.orders.unshift(order);
    this.persist();
    return { ...customerOrder(order), trackingToken, paymentConfig: this.paymentConfig() };
  }
  private reserve(items: OrderItem[]) {
    for (const item of items) this.changeStock(item, -item.quantity);
  }
  private release(items: OrderItem[]) {
    for (const item of items) this.changeStock(item, item.quantity);
  }
  private changeStock(
    item: Pick<OrderItem, 'productId' | 'variantId'>,
    difference: number,
  ) {
    const p = this.products.find((x) => x.id === item.productId);
    const v = p?.variants?.find((x) => x.id === item.variantId);
    if (v) v.stock = Math.max(0, v.stock + difference);
    else if (p) p.stock = Math.max(0, p.stock + difference);
  }

  track(id: string, phone: string, token?: string) {
    this.sweepExpired();
    const order = this.orders.find((item) => item.id === id.toUpperCase());
    if (token || order?.trackingHash) return customerOrder(authorizeOrder(order, token));
    const clean = typeof phone === 'string' ? phone.replace(/\s/g, '') : '';
    if (!order || !/^[6-9]\d{9}$/.test(clean) || order.customer.phone.replace(/\D/g, '').slice(-10) !== clean)
      throw new NotFoundException('Order not found. Check your receipt and full mobile number.');
    const trackingToken = randomBytes(32).toString('hex');
    order.trackingHash = hashToken(trackingToken);
    this.persist();
    return { ...customerOrder(order), trackingToken };
  }
  customerOrders(credentials: Array<{ id: string; token: string }>) {
    if (!Array.isArray(credentials) || credentials.length > 50) throw new BadRequestException('Invalid order list');
    this.sweepExpired();
    return credentials.flatMap((credential) => {
      if (!credential || typeof credential.id !== 'string') return [];
      try {
        const order = authorizeOrder(this.orders.find((order) => order.id === credential.id), credential.token);
        return this.isVisibleOrder(order) ? [customerOrder(order)] : [];
      }
      catch { return []; }
    });
  }
  getOrder(id: string) {
    const order = this.orders.find((x) => x.id === id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
  adminOrders(includeArchived = false) {
    return this.orders.filter((order) => this.isVisibleOrder(order) && (includeArchived || !order.adminArchivedAt));
  }
  private isVisibleOrder(order: Order) {
    return Boolean(order.submittedAt || order.payment.reference || ['PAID', 'REFUNDED'].includes(order.payment.status));
  }
  cancelOrder(id: string) {
    const order = this.getOrder(id);
    if (order.status === 'Cancelled') return order;
    if (['Packed', 'Shipped', 'Out for Delivery', 'Delivered'].includes(order.status))
      throw new ConflictException('This order is already being dispatched and cannot be cancelled. Please contact the shop.');
    return this.updateStatus(id, 'Cancelled');
  }
  private validateReference(id: string, input: unknown) {
    if (typeof input !== 'string' || !/^\d{12}$/.test(input.trim()) || /^(\d)\1{11}$/.test(input.trim()))
      throw new BadRequestException('Enter the 12-digit UPI transaction reference from your payment app');
    const reference = input.trim();
    if (this.orders.some((order) => order.id !== id && order.payment.reference?.trim().toUpperCase() === reference))
      throw new ConflictException('This payment reference has already been submitted for another order');
    return reference;
  }
  archiveOrders(input: unknown) {
    const dto = input as { orderIds?: unknown; archived?: unknown } | null;
    if (!dto || typeof dto !== 'object' || Array.isArray(dto) || typeof dto.archived !== 'boolean'
      || !Array.isArray(dto.orderIds) || dto.orderIds.length < 1 || dto.orderIds.length > 100
      || dto.orderIds.some((id) => typeof id !== 'string' || !/^VKST-\d+$/.test(id))
      || new Set(dto.orderIds).size !== dto.orderIds.length)
      throw new BadRequestException('Choose 1 to 100 distinct order IDs and whether to archive or restore them');
    // Resolve and validate the entire batch before changing any record.
    const orders = (dto.orderIds as string[]).map((id) => this.getOrder(id));
    if (dto.archived && orders.some((order) => ['UNPAID', 'PENDING_VERIFICATION'].includes(order.payment.status)))
      throw new ConflictException('Resolve pending payments before removing these orders from history');
    const at = new Date().toISOString();
    let changed = false;
    for (const order of orders) {
      if (Boolean(order.adminArchivedAt) === dto.archived) continue;
      if (dto.archived) order.adminArchivedAt = at;
      else delete order.adminArchivedAt;
      changed = true;
    }
    // Retain IDs, receipts, payment history and inventory reservations. Archiving
    // is not cancellation and must not publish a customer status notification.
    if (changed) this.persist();
    return { orderIds: orders.map((order) => order.id), archived: dto.archived };
  }
  submitReference(id: string, reference: string) {
    this.sweepExpired();
    const order = this.getOrder(id);
    reference = this.validateReference(id, reference);
    if (order.status === 'Cancelled') throw new BadRequestException('Cancelled orders cannot accept payment references');
    if (['PENDING_VERIFICATION', 'PAID'].includes(order.payment.status) && order.payment.reference === reference) return order;
    if (order.payment.status !== 'UNPAID')
      throw new BadRequestException('Payment cannot be updated');
    order.payment.status = 'PENDING_VERIFICATION';
    order.payment.reference = reference;
    order.submittedAt = new Date().toISOString();
    this.changeStatus(order, 'Pending Verification');
    this.persist();
    return order;
  }
  updateStatus(id: string, status: OrderStatus) {
    const allowed: OrderStatus[] = [
      'Order Placed',
      'Payment Confirmed',
      'Confirmed',
      'Processing',
      'Packed',
      'Shipped',
      'Out for Delivery',
      'Delivered',
      'Cancelled',
    ];
    if (!allowed.includes(status))
      throw new BadRequestException('Invalid order status');
    const order = this.getOrder(id);
    if (order.status === status) return order;
    if (order.status === 'Cancelled' && status !== 'Cancelled')
      throw new BadRequestException('Cancelled orders cannot be reopened; create a new order');
    if (order.status === 'Delivered') throw new BadRequestException('Delivered orders cannot change status');
    if (status === 'Cancelled' && ['Packed', 'Shipped', 'Out for Delivery'].includes(order.status))
      throw new BadRequestException('Orders being dispatched cannot be cancelled');
    if (status !== 'Cancelled' && order.payment.status !== 'PAID')
      throw new BadRequestException('Verify payment before confirming or processing this order');
    const steps = ['Order Placed', 'Payment Confirmed', 'Confirmed', 'Processing', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];
    if (status !== 'Cancelled' && steps.indexOf(status) < steps.indexOf(order.status))
      throw new BadRequestException('Order status cannot move backwards');
    if (status === 'Cancelled' && order.status !== 'Cancelled') {
      this.release(order.items);
      if (order.payment.status === 'PAID' || order.payment.reference) order.refundRequired = order.payment.status !== 'REFUNDED';
      if (!['PAID', 'REFUNDED'].includes(order.payment.status)) order.payment.status = 'CANCELLED';
    }
    this.changeStatus(order, status);
    this.logger.log(`Order ${id} status changed to ${status}`);
    this.persist();
    return order;
  }
  updatePayment(id: string, status: PaymentStatus | string, reference?: string) {
    if (typeof status !== 'string') throw new BadRequestException('Invalid payment status');
    status = normalizePaymentStatus(status);
    const allowed: PaymentStatus[] = [
      'UNPAID',
      'PENDING_VERIFICATION',
      'PAID',
      'FAILED',
      'CANCELLED',
      'REFUNDED',
    ];
    if (!allowed.includes(status as PaymentStatus))
      throw new BadRequestException('Invalid payment status');
    const order = this.getOrder(id);
    if (order.status === 'Cancelled' && status !== 'REFUNDED')
      throw new BadRequestException('Cancelled orders can only record a refund');
    if (reference !== undefined) reference = this.validateReference(id, reference);
    if (reference && order.payment.reference && reference !== order.payment.reference)
      throw new ConflictException('A submitted payment reference cannot be replaced');
    if (status === 'PAID') {
      this.validateReference(id, reference || order.payment.reference);
      if (order.payment.status !== 'PENDING_VERIFICATION' && order.payment.status !== 'PAID')
        throw new BadRequestException('A submitted payment reference must be verified first');
    }
    if (order.payment.status === 'PAID' && !['PAID', 'REFUNDED'].includes(status))
      throw new BadRequestException('Collected payments can only be refunded');
    if (status === 'REFUNDED' && order.payment.status !== 'PAID' && !order.refundRequired)
      throw new BadRequestException('No collected payment or refund request exists');
    if (status === 'REFUNDED' && order.status !== 'Cancelled')
      throw new BadRequestException('Cancel the eligible order before recording its refund');
    if (!['PAID', 'REFUNDED', 'FAILED'].includes(status) && status !== order.payment.status)
      throw new BadRequestException('Use checkout payment submission to change pending payments');
    if (reference) order.payment.reference = reference;
    if (status === 'PAID') order.payment.verifiedAt ??= new Date().toISOString();
    order.payment.status = status as PaymentStatus;
    this.logger.log(`Order ${id} payment status changed to ${status}`);
    if (status === 'PAID' && ['Pending Verification', 'Order Placed'].includes(order.status)) this.changeStatus(order, 'Confirmed');
    if (status === 'FAILED' || status === 'REFUNDED') {
      if (order.status !== 'Cancelled') { this.release(order.items); this.changeStatus(order, 'Cancelled'); }
      order.refundRequired = false;
    }
    this.persist();
    return order;
  }
  updateShipment(id: string, shipment: Order['shipment']) {
    const order = this.getOrder(id);
    if (order.status === 'Cancelled' || order.status === 'Delivered' || order.payment.status !== 'PAID')
      throw new BadRequestException('Only active orders with verified payment can be shipped');
    if (!shipment?.type?.trim())
      throw new BadRequestException('Shipment type is required');
    order.shipment = shipment;
    this.persist();
    return order;
  }

  sweepExpired() {
    const now = Date.now();
    let changed = false;
    for (const order of this.orders)
      if (
        order.payment.status === 'UNPAID' &&
        order.status !== 'Cancelled' &&
        Date.parse(order.payment.expiresAt) <= now
      ) {
        order.payment.status = 'CANCELLED';
        this.changeStatus(order, 'Cancelled');
        this.release(order.items);
        changed = true;
      }
    if (changed) this.persist();
  }
  private changeStatus(order: Order, status: OrderStatus) {
    if (order.status === status) return;
    order.history ??= [
      { status: 'Order Placed', at: order.createdAt },
      ...(order.status === 'Order Placed' ? [] : [{ status: order.status, at: '' }]),
    ];
    order.status = status;
    order.statusVersion = (order.statusVersion || 0) + 1;
    order.history.push({ status, at: new Date().toISOString() });
  }
  dashboard() {
    this.sweepExpired();
    const orders = this.adminOrders();
    return {
      products: this.products.length,
      lowStock: this.products.filter(
        (p) => p.stock <= 5 || p.variants?.some((v) => v.stock <= 5),
      ).length,
      orders: orders.length,
      customers: new Set(
        orders.map((o) => o.customer.phone.replace(/\D/g, '')),
      ).size,
      revenue: orders
        .filter((o) => o.payment.status === 'PAID')
        .reduce((n, o) => n + o.total, 0),
      pendingPayments: orders.filter(
        (o) => o.payment.status === 'PENDING_VERIFICATION',
      ).length,
    };
  }
  customers() {
    const found = new Map<
      string,
      {
        customer: Order['customer'];
        orders: number;
        spent: number;
        lastOrderAt: string;
      }
    >();
    for (const order of this.adminOrders()) {
      const key = order.customer.phone.replace(/\D/g, '');
      const current = found.get(key);
      found.set(key, {
        customer: order.customer,
        orders: (current?.orders || 0) + 1,
        spent:
          (current?.spent || 0) +
          (order.payment.status === 'PAID' ? order.total : 0),
        lastOrderAt: current?.lastOrderAt || order.createdAt,
      });
    }
    return [...found.values()];
  }

  private validateProduct(input: Partial<Product>): Partial<Product> {
    if (typeof input.name !== 'string' || !input.name.trim())
      throw new BadRequestException('Product name is required');
    if (!this.categories.some((category) => category.id === input.categoryId))
      throw new BadRequestException('Choose an existing category');
    for (const field of ['price', 'originalPrice'] as const) {
      const amount = input[field];
      if (
        (field === 'price' || amount !== undefined) &&
        (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)
      )
        throw new BadRequestException('Prices must be non-negative numbers');
    }
    if (
      input.stock !== undefined &&
      (!Number.isSafeInteger(input.stock) || input.stock < 0)
    )
      throw new BadRequestException(
        'Stock must be a non-negative whole number',
      );
    for (const field of ['enabled', 'manualOutOfStock', 'customShadeEnabled'] as const) {
      if (input[field] !== undefined && typeof input[field] !== 'boolean')
        throw new BadRequestException(`${field} must be true or false`);
    }
    for (const field of ['hsn', 'short', 'description', 'accent'] as const) {
      if (input[field] !== undefined && typeof input[field] !== 'string')
        throw new BadRequestException(`${field} must be text`);
    }
    this.validateImageUrl(input.imageUrl);
    let specifications = input.specifications;
    if (input.colorName !== undefined && (typeof input.colorName !== 'string'
      || input.colorName.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(input.colorName)))
      throw new BadRequestException('Product color name must be text of up to 80 characters, without line breaks');
    if (specifications !== undefined) {
      if (!Array.isArray(specifications) || specifications.length > 40)
        throw new BadRequestException('Add at most 40 specifications');
      specifications = specifications.map((entry) => {
        if (!entry || typeof entry.label !== 'string' || !entry.label.trim() || entry.label.trim().length > 80
          || typeof entry.value !== 'string' || !entry.value.trim() || entry.value.trim().length > 500)
          throw new BadRequestException('Each specification needs a label (up to 80 characters) and value (up to 500 characters)');
        return { label: entry.label.trim(), value: entry.value.trim() };
      });
    }
    let variants = input.variants;
    if (variants !== undefined) {
      if (!Array.isArray(variants) || variants.length > 50)
        throw new BadRequestException('Add at most 50 colors');
      const ids = new Set<string>();
      variants = variants.map((variant) => {
        if (!variant || typeof variant.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(variant.id) || ids.has(variant.id))
          throw new BadRequestException('Each color needs a unique, valid ID');
        ids.add(variant.id);
        if (typeof variant.name !== 'string' || !variant.name.trim() || variant.name.trim().length > 80)
          throw new BadRequestException('Each color needs a name (up to 80 characters)');
        if (typeof variant.color !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(variant.color))
          throw new BadRequestException('Choose a valid hex color');
        if (typeof variant.price !== 'number' || !Number.isFinite(variant.price) || variant.price < 0
          || !Number.isSafeInteger(Math.round(variant.price * 100)))
          throw new BadRequestException('Color prices must be non-negative numbers');
        if (!Number.isSafeInteger(variant.stock) || variant.stock < 0)
          throw new BadRequestException('Color stock must be a non-negative whole number');
        return { id: variant.id, name: variant.name.trim(), color: variant.color, price: variant.price, stock: variant.stock };
      });
    }
    return {
      ...input, name: input.name.trim(),
      ...(input.colorName !== undefined ? { colorName: input.colorName.trim() } : {}),
      ...(specifications !== undefined ? { specifications } : {}),
      ...(variants !== undefined ? { variants } : {}),
      ...(variants?.length ? { price: Math.min(...variants.map((variant) => variant.price)), stock: variants.reduce((sum, variant) => sum + variant.stock, 0) } : {}),
    };
  }

  private validateCategory(input: Partial<Category>): Partial<Category> {
    if (
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.trim().length > 120
    )
      throw new BadRequestException(
        'Category name must be between 1 and 120 characters',
      );
    if (
      input.icon !== undefined &&
      (typeof input.icon !== 'string' || input.icon.length > 32)
    )
      throw new BadRequestException('Category icon must be a short symbol');
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean')
      throw new BadRequestException(
        'Category visibility must be true or false',
      );
    this.validateImageUrl(input.imageUrl);
    return { ...input, name: input.name.trim() };
  }

  private validateImageUrl(value: unknown) {
    if (value === undefined || value === '') return;
    if (typeof value !== 'string' || !/^(https?:\/\/|\/(?!\/))/i.test(value))
      throw new BadRequestException(
        'Image must use an http(s) URL or a local / path',
      );
  }

  createProduct(input: Partial<Product>) {
    input = { ...this.validateProduct(input), ...normalizeProductImages(input) };
    if (
      !input.name?.trim() ||
      !input.categoryId ||
      !Number.isFinite(input.price) ||
      Number(input.price) < 0
    )
      throw new BadRequestException(
        'Name, category and a valid price are required',
      );
    const id = input.id?.trim() || randomUUID();
    if (this.products.some((p) => p.id === id))
      throw new BadRequestException('Product ID already exists');
    const product = {
      stock: 0,
      hsn: '',
      short: '',
      description: '',
      accent: '#64748b',
      enabled: true,
      ...input,
      id,
    } as Product;
    this.products.unshift(product);
    this.persist();
    return product;
  }
  updateProduct(id: string, patch: Partial<Product>) {
    const product = this.entity(this.products, id, 'Product');
    const validated = this.validateProduct({ ...product, ...patch, ...normalizeProductImages(patch, product) });
    this.validateColorTransition(product, validated.variants ?? []);
    Object.assign(product, validated, { id: product.id });
    this.persist();
    return product;
  }
  updateProductColors(id: string, input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('Wire colors and the previous inventory are required');
    const { variants, expected } = input as { variants?: Product['variants']; expected?: Pick<Product, 'price' | 'stock' | 'variants'> };
    if (!Array.isArray(variants) || !expected || !Array.isArray(expected.variants))
      throw new BadRequestException('Provide the color options and reload the current inventory');
    const product = this.entity(this.products, id, 'Product');
    // Never overwrite a sale or another admin's changes made while this editor was open.
    const snapshot = (rows: NonNullable<Product['variants']>) => rows.map((row) =>
      [row?.id, row?.name, row?.color, row?.price, row?.stock]);
    if (expected.price !== product.price || expected.stock !== product.stock
      || JSON.stringify(snapshot(expected.variants)) !== JSON.stringify(snapshot(product.variants ?? [])))
      throw new ConflictException('This product changed while you were editing. Close the editor and reload wire products before saving.');
    const stock = !variants.length && product.variants?.length
      ? product.variants.reduce((sum, variant) => sum + variant.stock, 0) : product.stock;
    const validated = this.validateProduct({ ...product, variants, stock });
    const names = validated.variants!.map((variant) => variant.name.toLowerCase());
    if (new Set(names).size !== names.length) throw new BadRequestException('Use a different name for each color');
    this.validateColorTransition(product, validated.variants!);
    Object.assign(product, { variants: validated.variants, price: validated.price, stock: validated.stock });
    this.persist();
    return product;
  }
  private validateColorTransition(product: Product, variants: NonNullable<Product['variants']>) {
    const activeItems = this.orders.filter((order) => !['Cancelled', 'Delivered'].includes(order.status))
      .flatMap((order) => order.items).filter((item) => item.productId === product.id);
    if ((!product.variants?.length && variants.length && activeItems.some((item) => !item.variantId))
      || activeItems.some((item) => item.variantId && !variants.some((variant) => variant.id === item.variantId)))
      throw new ConflictException('An open order uses this inventory. Complete or cancel that order before changing its color options.');
  }
  deleteProduct(id: string) {
    return this.removeEntity(this.products, id, 'Product');
  }
  adjustStock(id: string, quantity: number, variantId?: string) {
    if (!Number.isInteger(quantity) || quantity < 0)
      throw new BadRequestException('Stock must be a non-negative integer');
    const product = this.entity(this.products, id, 'Product');
    if (variantId) {
      const variant = product.variants?.find((x) => x.id === variantId);
      if (!variant) throw new NotFoundException('Variant not found');
      variant.stock = quantity;
    } else product.stock = quantity;
    this.persist();
    return product;
  }

  createCategory(input: Partial<Category>) {
    input = this.validateCategory(input);
    this.assertUniqueCategoryName(input.name!);
    return this.createEntity(this.categories, input, 'Category', {
      name: '',
      icon: '',
      enabled: true,
    });
  }
  updateCategory(id: string, patch: Partial<Category>) {
    const category = this.entity(this.categories, id, 'Category');
    const validated = this.validateCategory({ ...category, ...patch });
    this.assertUniqueCategoryName(validated.name!, id);
    return this.updateEntity(
      this.categories,
      id,
      validated,
      'Category',
    );
  }
  private assertUniqueCategoryName(name: string, exceptId?: string) {
    if (this.categories.some((item) => item.id !== exceptId && item.name.trim().toLowerCase() === name.trim().toLowerCase()))
      throw new BadRequestException('A category with this name already exists');
  }
  importShopCategories() {
    let added = 0;
    for (const category of shopCategories) {
      if (this.categories.some((item) => item.id === category.id || item.name.trim().toLowerCase() === category.name.toLowerCase())) continue;
      this.categories.push({ ...category });
      added++;
    }
    if (added) this.persist();
    return { added, categories: this.categories };
  }
  deleteCategory(id: string) {
    if (this.products.some((p) => p.categoryId === id && p.enabled))
      throw new BadRequestException(
        'Disable or move products in this category first',
      );
    return this.removeEntity(this.categories, id, 'Category');
  }
  createBanner(input: Partial<Banner>) {
    this.validateImageUrl(input.imageUrl);
    input = this.validateBannerMedia(input);
    if (
      !input.label?.trim() ||
      !input.title?.trim() ||
      !input.description?.trim() ||
      !input.categoryId
    )
      throw new BadRequestException(
        'Label, title, description and category are required',
      );
    const id = String(input.id || randomUUID()).trim();
    const imageUrl = input.imageUrl?.trim() || `/api/media/banners/${id}.svg`;
    const order =
      input.order ||
      Math.max(0, ...this.banners.map((banner) => banner.order || 0)) + 1;
    return this.createEntity(
      this.banners,
      { ...input, id, imageUrl, order },
      'Banner',
      {
        label: '',
        title: '',
        description: '',
        categoryId: '',
        accent: '#1d4ed8',
        enabled: true,
        duration: 0,
        buttonText: 'Shop now',
        linkType: 'category',
      },
    );
  }
  updateBanner(id: string, patch: Partial<Banner>) {
    this.validateImageUrl(patch.imageUrl);
    patch = this.validateBannerMedia(patch);
    return this.updateEntity(this.banners, id, patch, 'Banner');
  }
  private validateBannerMedia(input: Partial<Banner>): Partial<Banner> {
    const result = { ...input };
    if (input.brands !== undefined) {
      if (!Array.isArray(input.brands) || input.brands.length > 12
        || input.brands.some((brand) => typeof brand !== 'string' || brand.trim().length > 40))
        throw new BadRequestException('Brands must be up to 12 names of up to 40 characters');
      result.brands = input.brands.map((brand) => brand.trim()).filter(Boolean);
    }
    if (input.gallery !== undefined) {
      if (!Array.isArray(input.gallery) || input.gallery.length > 2)
        throw new BadRequestException('Add up to 2 extra banner images');
      if (input.gallery.some((url) => typeof url !== 'string'))
        throw new BadRequestException('Extra banner images must be URLs');
      input.gallery.forEach((url) => this.validateImageUrl(url));
      result.gallery = input.gallery.map((url) => url.trim()).filter(Boolean);
    }
    if (input.theme !== undefined && input.theme !== '' && !bannerThemes.includes(input.theme))
      throw new BadRequestException('Choose a valid banner style');
    if (input.cutout !== undefined && typeof input.cutout !== 'boolean')
      throw new BadRequestException('Transparent photo setting must be true or false');
    if (input.videoUrl !== undefined) {
      const url = typeof input.videoUrl === 'string' ? input.videoUrl.trim() : null;
      if (url === null || (url && !/^(https:\/\/|\/(?!\/))\S+\.(mp4|webm)$/i.test(url)))
        throw new BadRequestException('Banner video must be an .mp4 or .webm https URL or local / path');
      result.videoUrl = url;
    }
    return result;
  }
  deleteBanner(id: string) {
    return this.removeEntity(this.banners, id, 'Banner');
  }
  createDeliveryRule(input: Partial<DeliveryRule>) {
    return this.createEntity(this.deliveryRules, input, 'Delivery rule', {
      match: '',
      charge: 0,
    });
  }
  updateDeliveryRule(id: string, patch: Partial<DeliveryRule>) {
    return this.updateEntity(this.deliveryRules, id, patch, 'Delivery rule');
  }
  deleteDeliveryRule(id: string) {
    return this.removeEntity(this.deliveryRules, id, 'Delivery rule');
  }
  createCustomerCategory(input: Partial<CustomerCategory>) {
    return this.createEntity(
      this.customerCategories,
      input,
      'Customer category',
      { name: '', discountPercent: 0, minimum: 0 },
    );
  }
  updateCustomerCategory(id: string, patch: Partial<CustomerCategory>) {
    return this.updateEntity(
      this.customerCategories,
      id,
      patch,
      'Customer category',
    );
  }
  deleteCustomerCategory(id: string) {
    if (id === 'customer')
      throw new BadRequestException(
        'The default customer category cannot be deleted',
      );
    return this.removeEntity(this.customerCategories, id, 'Customer category');
  }
  updateShop(patch: Partial<Shop>) {
    if ('paintShades' in patch) throw new BadRequestException('Use the Paint shades editor to update shades');
    if (patch.gstRate !== undefined && (typeof patch.gstRate !== 'number' || !Number.isFinite(patch.gstRate) || patch.gstRate < 0 || patch.gstRate > 100))
      throw new BadRequestException('GST rate must be between 0 and 100');
    if (patch.gstInclusive !== undefined && typeof patch.gstInclusive !== 'boolean')
      throw new BadRequestException('GST inclusive must be true or false');
    validateSoundSettings(patch, this.shop);
    this.validateImageUrl(patch.logoUrl);
    const { upiId, lastOrderNumber, ...rest } = patch;
    Object.assign(this.shop, rest);
    if (upiId !== undefined) this.shop.upiId = upiId.trim();
    this.persist();
    return this.shop;
  }
  createPaintShade(input: unknown) {
    const shades = this.paintShades;
    if (shades.length >= 1000) throw new BadRequestException('The shade card supports up to 1000 shades');
    const shade = validatePaintShade(input, randomUUID(), shades);
    this.shop.paintShades = [...shades, shade];
    this.persist();
    return shade;
  }

  updatePaintShade(id: string, input: unknown) {
    const shades = this.paintShades;
    const existing = shades.find((shade) => shade.id === id);
    if (!existing) throw new NotFoundException('Paint shade not found');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid paint shade');
    const shade = validatePaintShade({ ...existing, ...input }, id, shades);
    this.shop.paintShades = shades.map((item) => item.id === id ? shade : item);
    this.persist();
    return shade;
  }

  configuration() {
    const { paintShades, lastOrderNumber, ...shop } = this.shop;
    return {
      shop,
      deliveryRules: this.deliveryRules,
      customerCategories: this.customerCategories,
      banners: this.banners,
      categories: this.categories,
    };
  }

  orderAlerts() {
    return {
      orders: this.adminOrders().map(({ id, createdAt, submittedAt }) => ({ id, createdAt: submittedAt || createdAt })),
      activeOrders: this.adminOrders().filter((order) => !['Delivered', 'Cancelled'].includes(order.status)).length,
      sound: {
        orderSoundEnabled: this.shop.orderSoundEnabled !== false,
        orderSound: this.shop.orderSound || 'chime',
        orderSoundVolume: this.shop.orderSoundVolume ?? 70,
        orderSoundUrl: this.shop.orderSoundUrl || '',
      },
    };
  }

  private entity<T extends { id: string }>(
    items: T[],
    id: string,
    label: string,
  ) {
    const item = items.find((x) => x.id === id);
    if (!item) throw new NotFoundException(`${label} not found`);
    return item;
  }
  private createEntity<T extends { id: string }>(
    items: T[],
    input: Partial<T>,
    label: string,
    defaults: Omit<T, 'id'>,
  ) {
    const id = String(input.id || randomUUID()).trim();
    if (items.some((x) => x.id === id))
      throw new BadRequestException(`${label} ID already exists`);
    const item = { ...defaults, ...input, id } as T;
    items.push(item);
    this.persist();
    return item;
  }
  private updateEntity<T extends { id: string }>(
    items: T[],
    id: string,
    patch: Partial<T>,
    label: string,
  ) {
    const item = this.entity(items, id, label);
    Object.assign(item, patch, { id: item.id });
    this.persist();
    return item;
  }
  private removeEntity<T extends { id: string }>(
    items: T[],
    id: string,
    label: string,
  ) {
    const index = items.findIndex((x) => x.id === id);
    if (index < 0) throw new NotFoundException(`${label} not found`);
    items.splice(index, 1);
    this.persist();
    return { deleted: true, id };
  }
}
