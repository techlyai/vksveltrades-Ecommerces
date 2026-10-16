import {
  Banner,
  Category,
  CustomerCategory,
  DeliveryRule,
  Product,
} from "./models";
import { defaultCheckoutTiers } from './checkout-tiers';

// New installations intentionally start without demo catalog data. Products,
// categories, banners and delivery rules are created by the shop administrator.
export const categories: Category[] = [];
export const products: Product[] = [];
export const banners: Banner[] = [];
export const deliveryRules: DeliveryRule[] = [];

// The requested checkout defaults; existing shops receive a one-time data update.
export const customerCategories: CustomerCategory[] = defaultCheckoutTiers;

export const shop = {
  name: "V K S VEL TRADERS",
  legalName: "",
  gstin: "",
  phone: "",
  email: "",
  address: "",
  tagline: "Electrical | Plumbing | Paints | Hardware",
  minimumOrder: 0,
  gstRate: 0,
  gstInclusive: true,
  maduraiFree: false,
  defaultDeliveryCharge: 0,
  outsideTamilNaduCharge: 0,
  upiId: process.env.PAYMENT_UPI_ID || "",
  payeeName: "V K S VEL TRADERS",
  paymentWindowMinutes: 30,
  trustBadges: [] as string[],
  footerText: "",
  logoUrl: "/api/media/logo.svg",
  bannerAutoSlide: true,
  bannerInterval: 2,
  merchantCategoryCode: "",
  merchantReference: "",
  terminalId: "",
  orderSoundEnabled: true,
  orderSound: "chime",
  orderSoundVolume: 70,
};
