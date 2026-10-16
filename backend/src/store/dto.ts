export class CartItemDto {
  productId!: string;
  variantId?: string;
  customShadeCode?: string;
  quantity!: number;
}
export class CustomerDto {
  name!: string; phone!: string; address!: string; area!: string; city!: string; district!: string; state!: string; pincode!: string;
}
export class QuoteDto {
  items!: CartItemDto[]; customer!: CustomerDto; customerCategoryId!: string;
}
export class PaymentReferenceDto { reference!: string; }
export class UpdateOrderDto { status!: string; }
export class LoginDto { username!: string; password!: string; }
