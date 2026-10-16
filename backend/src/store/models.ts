export type Category = { id: string; name: string; icon: string; enabled: boolean; imageUrl?: string };
export type Variant = { id: string; name: string; color: string; price: number; stock: number };
export type PaintShade = { id: string; code: string; name: string; brand: string; family: string; color: string; imageUrl?: string; enabled: boolean };
export type Product = {
  id: string; name: string; categoryId: string; price: number; originalPrice?: number; stock: number; hsn: string;
  short: string; description: string; accent: string; enabled: boolean; manualOutOfStock?: boolean;
  imageUrl?: string; imageUrls?: string[]; colorName?: string; variants?: Variant[]; specifications?: Array<{ label: string; value: string }>; customShadeEnabled?: boolean;
};
export type CustomerCategory = { id: string; name: string; discountPercent: number; minimum: number };
export type DeliveryRule = { id: string; match: string; charge: number };
export type Customer = { name: string; phone: string; address: string; area: string; city: string; district: string; state: string; pincode: string };
export type OrderItem = { productId: string; variantId?: string; name: string; price: number; quantity: number; hsn: string; shade?: string; color?: string; customShadeCode?: string };
export type OrderStatus = 'Pending Payment' | 'Pending Verification' | 'Order Placed' | 'Payment Confirmed' | 'Confirmed' | 'Processing' | 'Packed' | 'Shipped' | 'Out for Delivery' | 'Delivered' | 'Cancelled';
export type PaymentStatus = 'UNPAID' | 'PENDING_VERIFICATION' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type Order = {
  checkoutSession?: boolean; submittedAt?: string; refundRequired?: boolean;
  adminArchivedAt?: string;
  trackingHash?: string; statusVersion?: number;
  history?: Array<{ status: OrderStatus; at: string }>;
  id: string; createdAt: string; customer: Customer; customerCategory: string; items: OrderItem[];
  customerCategoryId?: string; discountPercent?: number;
  subtotal: number; discount: number; delivery: number; gst: number; total: number;
  gstRate?: number; gstInclusive?: boolean;
  status: OrderStatus; payment: { status: PaymentStatus; method: string; reference?: string; expiresAt: string; verifiedAt?: string };
  shipment?: { type: string; trackingNumber?: string; expected?: string };
};
export type Banner = {
  id: string; label: string; title: string; description: string; categoryId: string; accent: string;
  brands?: string[]; videoUrl?: string; gallery?: string[]; cutout?: boolean; theme?: string; imageUrl?: string; enabled?: boolean; order?: number; duration?: number; buttonText?: string;
  linkType?: 'category' | 'orders' | 'url' | 'none'; linkValue?: string;
};
export type Shop = {
  lastOrderNumber?: number;
  paintShades?: PaintShade[];
  openingHours?: string;
  name: string; legalName: string; gstin: string; phone: string; email: string; address: string; tagline: string;
  minimumOrder: number; gstRate: number; gstInclusive: boolean; maduraiFree: boolean; defaultDeliveryCharge: number;
  outsideTamilNaduCharge: number; upiId: string; payeeName: string; paymentWindowMinutes: number;
  trustBadges: string[]; footerText: string; logoUrl: string; bannerAutoSlide: boolean; bannerInterval: number;
  merchantCategoryCode?: string; merchantReference?: string; terminalId?: string;
  orderSoundEnabled?: boolean; orderSound?: string; orderSoundVolume?: number; orderSoundUrl?: string;
};
