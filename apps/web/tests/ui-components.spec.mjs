import { strict as assert } from 'node:assert';
import { test, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire, Module } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Render the actual TSX components without writing compiled artifacts or
// connecting to a live shop. These are structure checks, not visual tests.
const require = createRequire(import.meta.url);
const extensions = ['.tsx', '.ts', '.css'];
const previous = Object.fromEntries(extensions.map((extension) => [extension, Module._extensions[extension]]));
for (const extension of ['.tsx', '.ts']) Module._extensions[extension] = (module, filename) => {
  const source = readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } });
  module._compile(outputText, filename);
};
Module._extensions['.css'] = (module) => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }; };
after(() => { for (const extension of extensions) { if (previous[extension]) Module._extensions[extension] = previous[extension]; else delete Module._extensions[extension]; } });
const { StoreHeader } = require('../components/store/StoreHeader.tsx');
const { StoreCatalog } = require('../components/store/StoreCatalog.tsx');
const { ProductCard } = require('../components/store/ProductCard.tsx');
const { ProductDetails } = require('../components/store/ProductDetails.tsx');
const { PaintShadePicker } = require('../components/store/PaintShadePicker.tsx');
const { StoreFooter } = require('../components/store/StoreFooter.tsx');
const { AdminShell } = require('../components/admin/AdminShell.tsx');
const { CommercePage, CheckoutSection } = require('../components/store/CommerceLayout.tsx');
const { MyOrders } = require('../components/store/MyOrders.tsx');
const { BannerCarousel } = require('../components/store/BannerCarousel.tsx');
const { TrustBadges } = require('../components/store/TrustBadges.tsx');
const { DeliveryManager } = require('../components/AdminPanel.tsx');
const { OrdersTable } = require('../components/AdminPanel.tsx');
const { ProductEditor } = require('../components/CatalogEditors.tsx');
const { OrderDetails } = require('../components/store/OrderDetails.tsx');
const { ShopWordmark } = require('../components/store/ShopWordmark.tsx');
const { metadata } = require('../app/layout.tsx');
const { Checkout, Payment } = require('../components/Storefront.tsx');
const { CheckoutField } = require('../components/store/CheckoutField.tsx');
const { CustomerTypeSelect } = require('../components/store/CustomerTypeSelect.tsx');
const { CheckoutTotals } = require('../components/store/CheckoutTotals.tsx');
const noop = () => {};
const shop = { name: 'Test shop', tagline: 'Shop tagline', footerText: 'Shop information', logoUrl: '/api/media/logo.svg', trustBadges: [], minimumOrder: 0, gstInclusive: true };
const product = { id: 'one', name: 'Test light', short: 'Warm white', description: 'Product details', categoryId: 'lighting', enabled: true, price: 120, stock: 3, hsn: '8539', accent: '#2156e8' };
const catalog = { shop, categories: [{ id: 'lighting', name: 'Lighting', icon: 'bulb', enabled: true }], products: [product], banners: [] };
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));

test('shared storefront, admin and tracking layout uses the actual VKS logo as its favicon', () => {
  assert.deepEqual(metadata.icons.icon, [
    { url: '/favicon.ico?v=2', type: 'image/x-icon', sizes: '16x16 32x32 48x48' },
    { url: '/brand/favicon-32.png?v=2', type: 'image/png', sizes: '32x32' },
    { url: '/brand/favicon-16.png?v=2', type: 'image/png', sizes: '16x16' },
  ]);
  assert.equal(metadata.icons.shortcut, '/favicon.ico?v=2');
  assert.deepEqual(metadata.icons.apple, [{ url: '/brand/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' }]);
  const logo = readFileSync(new URL('../public/brand/shop-logo.png', import.meta.url));
  assert.equal(logo.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('tracking details render the real receipt, status history, copy and print controls', () => {
  const order = { id: 'VKST-1001', createdAt: '2026-10-12T10:00:00Z', status: 'Packed', customer: { name: 'Customer', phone: '9876543210', address: 'Street', area: 'Sellur', city: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625002' }, payment: { status: 'PAID', method: 'UPI', reference: '123456789012' }, items: [{ productId: 'one', name: 'Test lamp', quantity: 2, price: 120 }], subtotal: 240, discount: 0, delivery: 20, gst: 0, total: 260, shipment: { type: 'Courier', trackingNumber: 'TEST123' }, history: [{ status: 'Pending Payment', at: '2026-10-12T10:00:00Z' }, { status: 'Packed', at: '2026-10-12T11:00:00Z' }] };
  const html = render(OrderDetails, { order, token: 'a'.repeat(64) });
  for (const text of ['VKST-1001', 'Please save your Order ID or take a screenshot to track your order later.', 'Copy Order ID', 'Print / Save as PDF', 'Order timeline', 'Test lamp', 'TEST123', '123456789012', 'active subscription']) assert.ok(html.includes(text), text);
  assert.match(html, /aria-current="step"/);
  assert.doesNotMatch(html, /Shipped<\/b>|Delivered<\/b>/);
  const wordmark = render(ShopWordmark, { name: 'V K S VEL TRADERS' });
  assert.match(wordmark, /wordmarkGold">VKS<\/span> VEL TRADERS/);
});

test('orders icon badge counts active saved orders without restoring its text label', () => {
  const html = render(StoreHeader, { catalog, category: 'all', query: '', quantity: 7, activeOrders: 2, onCategory: noop, onQuery: noop, onCart: noop, onOrders: noop, onWishlist: noop, onProduct: noop });
  assert.match(html, /aria-label="2 active orders" aria-live="polite">2/);
  assert.match(html, /View cart, 7 items/);
  assert.doesNotMatch(html, /<span>My Orders<\/span>/);
});

test('cart header hides both category entry points while keeping cart and orders', () => {
  const html = render(StoreHeader, { catalog, category: 'all', query: '', quantity: 3, showCategories: false, onCategory: noop, onQuery: noop, onCart: noop, onOrders: noop, onWishlist: noop, onProduct: noop });
  assert.doesNotMatch(html, /Browse categories|categoryRail|<span>Categories/);
  assert.match(html, /View cart, 3 items/);
  assert.match(html, /aria-label="My Orders"/);
});

test('owner banner uses the provided artwork and full-width layout, not compact sample styling', () => {
  const html = render(BannerCarousel, { catalog: { ...catalog, banners: [{ id: 'owner-banner-finolex', title: 'Wires & Cables', imageUrl: '/banners/finolex.jpeg', enabled: true, duration: 2, linkType: 'category', categoryId: 'lighting' }] }, onCategory: noop, onOrders: noop });
  assert.match(html, /src="\/banners\/finolex.jpeg"/);
  assert.match(html, /class="banner"/);
  assert.doesNotMatch(html, /sampleBanner|bannerArtwork/);
});

test('delivery settings visibly mark required fields and enforce nonnegative charges', () => {
  const html = render(DeliveryManager, { config: { shop: { ...shop, defaultDeliveryCharge: 0, outsideTamilNaduCharge: 0 }, deliveryRules: [{ id: 'rule', match: 'Madurai', charge: 0 }] }, busy: false, onSaveShop: noop, onMutate: noop });
  assert.equal((html.match(/required=""/g) || []).length, 4);
  assert.equal((html.match(/min="0"/g) || []).length, 3);
  assert.match(html, /Location \/ pincode/);
  assert.match(html, /required-mark/);
});

test('header has accessible navigation, search and live catalog counts', () => {
  const html = render(StoreHeader, { catalog, category: 'all', query: '', quantity: 2, onCategory: noop, onQuery: noop, onCart: noop, onOrders: noop, onProduct: noop });
  assert.match(html, /aria-label="Browse categories"/);
  assert.match(html, /aria-label="Search products"/);
  assert.match(html, /aria-label="View cart, 2 items"/);
  assert.match(html, /Lighting/);
  assert.doesNotMatch(html, /preview-header/);
});
test('product card replaces Add with stock-limited quantity controls', () => {
  const html = render(ProductCard, { product, categoryName: 'Lighting', quantity: 3, onAdd: noop, onDecrease: noop, onOpen: noop });
  assert.match(html, /aria-label="Remove one Test light"/);
  assert.match(html, /disabled="" aria-label="Add one Test light"/);
  assert.match(html, /<output aria-live="polite">3<\/output>/);
  assert.doesNotMatch(html, /Choose shade/);
});
test('catalog renders an honest empty state without sample products', () => {
  const html = render(StoreCatalog, { catalog: { ...catalog, products: [] }, cart: [], category: 'all', query: '', sort: 'featured', onSort: noop, onCategory: noop, onOrders: noop, onAdd: noop, onDecrease: noop, onProduct: noop, onReset: noop });
  assert.match(html, /Products are on their way/);
  assert.doesNotMatch(html, /class="productCard"/);
  assert.match(html, /Electrical \| Plumbing \| Paints \| Hardware/);
});
test('product details provide labelled dialog, shade selectors and correct tax wording', () => {
  const html = render(ProductDetails, { product: { ...product, variants: [{ id: 'blue', name: 'Blue', color: '#00f', stock: 0, price: 150 }] }, gstInclusive: false, gstRate: 18, onAdd: noop, onClose: noop });
  assert.match(html, /aria-labelledby="product-detail-title"/);
  assert.match(html, /Available colors/);
  assert.match(html, /18% GST added at checkout/);
  assert.match(html, /Unavailable/);
});

test('product forms show four independent upload slots with only the main photo required', () => {
  const html = render(ProductEditor, { draft: { ...product, imageUrl: '/legacy.jpg', variants: [] }, categories: catalog.categories, gstInclusive: true, setDraft: noop, onSave: noop, onClose: noop });
  assert.equal((html.match(/type="file"/g) || []).length, 4);
  assert.equal((html.match(/aria-required="true"/g) || []).length, 1);
  assert.match(html, /Main Product Image \(Required\)/);
  for (const index of [2, 3, 4]) assert.match(html, new RegExp(`Additional Image ${index} \\(Optional\\)`));
  assert.match(html, /Available colors \(Optional\)/);
  assert.match(html, /src="\/legacy.jpg"/);
});

test('the gallery uses the first image and displays thumbnails only for supplied photos', () => {
  const props = { product: { ...product, imageUrls: ['/main.webp', '', '/third.webp', '/fourth.webp'], variants: [] }, gstInclusive: true, gstRate: 18, onAdd: noop, onClose: noop };
  const html = render(ProductDetails, props);
  assert.match(html, /aria-label="Product photos"/);
  assert.equal((html.match(/aria-label="View product image \d"/g) || []).length, 3);
  assert.match(html, /src="\/main.webp"/);
  assert.match(html, /Add to cart/);
  const legacy = render(ProductDetails, { ...props, product: { ...product, imageUrl: '/legacy.jpg' } });
  assert.match(legacy, /src="\/legacy.jpg"/);
  assert.doesNotMatch(legacy, /View product image/);
});
test('footer uses the shop data and dedicated light-layout component', () => {
  const html = render(StoreFooter, { shop, onOrders: noop, onAdmin: noop });
  assert.match(html, /class="footer"/);
  assert.match(html, /Shop information/);
  assert.match(html, /Visit the shop/);
  assert.doesNotMatch(html, /Admin login/);
  assert.doesNotMatch(html, /footer-grid|Built for the trade/);
});

test('orders and wishlist navigation are icon-only and cart shows zero without hiding the badge', () => {
  const html = render(StoreHeader, { catalog, category: 'all', query: '', quantity: 0, onCategory: noop, onQuery: noop, onCart: noop, onOrders: noop, onWishlist: noop, onProduct: noop, wishlistActive: true });
  assert.match(html, /aria-label="My Orders"/);
  assert.match(html, /aria-label="Wishlist" title="Wishlist" aria-current="page"/);
  assert.doesNotMatch(html, /<span>My Orders<\/span>/);
  assert.match(html, /<span>Categories<\/span>/);
  assert.match(html, /aria-label="View cart, 0 items"/);
  assert.match(html, /<b aria-live="polite" aria-atomic="true">0<\/b>/);
});

test('product hearts have outline/filled states with separate non-nested buttons', () => {
  for (const saved of [false, true]) {
    const html = render(ProductCard, { product, categoryName: 'Lighting', quantity: 0, saved, onAdd: noop, onDecrease: noop, onOpen: noop, onWishlist: noop });
    assert.match(html, new RegExp(`aria-pressed="${saved}"`));
    const heart = html.match(/<button class="wishlistHeart"[^]*?<\/button>/)?.[0];
    assert.ok(heart);
    assert.match(heart, new RegExp(`fill="${saved ? 'currentColor' : 'none'}"`));
    assert.match(html, /<\/button><button class="wishlistHeart"/);
  }
});

test('wishlist section displays saved products only and has an actionable empty state', () => {
  const props = { catalog, cart: [], category: 'all', query: '', sort: 'featured', wishlistMode: true, onSort: noop, onCategory: noop, onOrders: noop, onAdd: noop, onDecrease: noop, onProduct: noop, onReset: noop, onWishlist: noop };
  const saved = render(StoreCatalog, { ...props, savedIds: ['one'] });
  assert.match(saved, /Your wishlist/);
  assert.match(saved, /Test light/);
  assert.doesNotMatch(saved, /aria-roledescription="carousel"/);
  const empty = render(StoreCatalog, { ...props, savedIds: [] });
  assert.match(empty, /Your wishlist is empty/);
  assert.match(empty, /Browse all products/);
  assert.doesNotMatch(empty, /Test light/);
});
test('admin layout groups navigation once and renders active content', () => {
  const html = render(AdminShell, { shop, tab: 'products', subtitle: 'Manage products', pendingOrders: 2, onNavigate: noop, onLogout: noop, children: React.createElement('p', null, 'Product table') });
  assert.equal((html.match(/>Overview<\/span>/g) || []).length, 1);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /Product table/);
  assert.match(html, /2 to process/);
});
test('checkout layout exposes progress and separate form sections', () => {
  const html = render(CommercePage, { title: 'Checkout', backLabel: 'Back to cart', onBack: noop, step: 2, children: React.createElement(CheckoutSection, { number: '01', title: 'Customer', description: 'Contact details' }, React.createElement('input', { name: 'name' })) });
  assert.match(html, /aria-current="step"/);
  assert.match(html, /Customer/);
  assert.match(html, /name="name"/);
});

test('My Orders has the reference form layout, labelled inputs and a back action', () => {
  const html = render(MyOrders, { initial: null, onBack: noop });
  assert.match(html, /Continue shopping/);
  assert.match(html, /<h1>My Orders<\/h1>/);
  assert.match(html, /View your orders/);
  assert.match(html, /for="order-mobile"/);
  assert.match(html, /pattern="\[0-9\]\{10\}"/);
  assert.match(html, /for="order-id"/);
  assert.match(html, /View my orders/);
  assert.ok(html.indexOf('id="order-mobile"') < html.indexOf('id="order-id"'));
});

test('banner keeps slides and services without visible arrows, dots or pause controls', () => {
  const banners = [{ id: 'one', title: 'One', label: 'One', enabled: true }, { id: 'two', title: 'Two', label: 'Two', enabled: true }];
  const html = render(BannerCarousel, { catalog: { ...catalog, banners }, onCategory: noop, onOrders: noop });
  assert.match(html, /aria-roledescription="carousel"/);
  assert.match(html, /aria-label="1 of 2"/);
  assert.match(html, /Shop services/);
  assert.doesNotMatch(html, /Previous banner|Next banner|bannerControls|bannerDots|Pause slideshow|Play slideshow|Resume/);
});

test('checkout marks all eight mandatory customer fields and the customer-type dropdown without changing its sections', () => {
  const html = render(Checkout, { catalog: { ...catalog, customerCategories: [] }, cart: [], onCreated: noop, goto: noop });
  assert.equal((html.match(/class="required-mark"/g) || []).length, 9);
  assert.equal((html.match(/required=""/g) || []).length, 9);
  for (const key of ['name', 'phone', 'address', 'area', 'city', 'district', 'state', 'pincode']) {
    assert.match(html, new RegExp(`for="checkout-${key}"`));
    assert.match(html, new RegExp(`name="${key}"`));
  }
  assert.match(html, /two-col checkout-form/);
  assert.match(html, /Review order/);
  assert.match(html, /Proceed to UPI payment/);
});

const checkoutTypes = [
  { id: 'customer', name: 'Customer', discountPercent: 0, minimum: 0 },
  { id: 'engineers', name: 'Engineers', discountPercent: 5, minimum: 5000 },
  { id: 'electricians', name: 'Electricians', discountPercent: 10, minimum: 5000 },
];

test('customer type is one labelled native dropdown with Customer selected by default', () => {
  const html = render(CustomerTypeSelect, { categories: checkoutTypes, value: 'customer', onChange: noop });
  assert.match(html, /for="checkout-customer-type"/);
  assert.match(html, /Customer Type/);
  assert.equal((html.match(/<select /g) || []).length, 1);
  assert.equal((html.match(/<option /g) || []).length, 3);
  assert.match(html, /<option value="customer" selected="">Customer — Standard Price \(0% discount\)/);
  assert.match(html, /Engineers — 5% discount on eligible orders above ₹5,000/);
  assert.match(html, /Electricians — 10% discount on eligible orders above ₹5,000/);
  assert.doesNotMatch(html, /<button/);
  const css = readFileSync(new URL('../components/store/CommerceLayout.module.css', import.meta.url), 'utf8');
  assert.match(css, /checkout-tier\) select \{[^}]*width: 100%; max-width: 100%; min-width: 0;/);
  assert.match(css, /@media \(max-width: 600px\)[^]*checkout-tier\) select \{ font-size: 16px;/);
});

test('checkout, payment and printable receipts use the same server discount and exact payable amount', () => {
  for (const tier of checkoutTypes) for (const subtotal of [4999, 5000, 5001]) {
    const percent = subtotal > 5000 ? tier.discountPercent : 0;
    const discount = Math.round(subtotal * percent) / 100;
    const total = Math.round((subtotal - discount + 60) * 100) / 100;
    const order = { id: 'VKST-1234', subtotal, discount, discountPercent: percent, delivery: 60, gst: 0, total, customerCategory: tier.name, customer: {}, items: [], status: 'Pending Payment', createdAt: '2026-10-12T11:00:00Z', payment: { expiresAt: '2026-10-12T12:00:00Z', status: 'UNPAID', method: 'UPI' }, paymentConfig: { upiId: 'test@upi', payeeName: 'VKS VEL TRADERS' } };
    const amount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(total);
    const summary = render(CheckoutTotals, { totals: order });
    const payment = render(Payment, { order, setOrder: noop, done: noop });
    const receipt = render(OrderDetails, { order });
    for (const html of [summary, payment, receipt]) {
      assert.ok(html.includes(`Discount (${percent}%)`), `${tier.id}/${subtotal}`);
      assert.ok(html.includes(amount));
    }
    assert.ok(payment.includes(`am=${total.toFixed(2)}`));
    assert.match(summary, /Final payable amount/);
    assert.match(receipt, /Print \/ Save as PDF/);
  }
});

test('field errors are associated with their input and optional fields are not marked', () => {
  const html = render(CheckoutField, { id: 'checkout-phone', label: 'Mobile number', error: 'Enter a valid mobile number.' });
  assert.match(html, /Mobile number<span class="required-mark" aria-hidden="true">\*<\/span>/);
  assert.match(html, /aria-invalid="true" aria-describedby="checkout-phone-error"/);
  assert.match(html, /id="checkout-phone-error" class="checkout-field-error" role="alert"/);
  const optional = render(CheckoutField, { id: 'optional', label: 'Optional note', required: false });
  assert.doesNotMatch(optional, /required-mark|required=""|aria-describedby/);
});

test('payment reference is marked required while the UPI amount and link remain intact', () => {
  const html = render(Payment, { order: { id: 'VKST-1234', total: 450, status: 'Pending Payment', createdAt: '2026-10-12T11:00:00Z', customer: {}, payment: { expiresAt: '2026-10-12T12:00:00Z', method: 'UPI', status: 'UNPAID' }, items: [], paymentConfig: { upiId: 'test@upi', payeeName: 'VKS VEL TRADERS' } }, setOrder: noop, done: noop });
  assert.match(html, /Already paid\? Enter UTR \/ reference<span class="required-mark"/);
  assert.match(html, /id="payment-reference" required=""/);
  assert.match(html, /pattern="\[0-9\]\{12\}"/);
  assert.match(html, /upi:\/\/pay\?pa=test%40upi/);
  assert.match(html, /am=450.00/);
});

test('required marker and delivery alignment use scoped responsive-safe styles', () => {
  const css = readFileSync(new URL('../app/reference-theme.css', import.meta.url), 'utf8');
  assert.match(css, /\.required-mark\s*\{[^}]*display: inline;[^}]*margin-inline-start: 3px;[^}]*color: #DC2626;/);
  assert.match(css, /\.delivery-manager \.settings-fields.two\s*\{\s*align-items: end;/);
  const footer = render(StoreFooter, { shop, onOrders: noop });
  assert.match(footer, /Powered by<\/span><span class="poweredBrand">/);
  assert.match(footer, /techly-mark.svg" alt="" width="31" height="20"/);
});

test('pastel trust badges reflect checkout configuration, not invented delivery/payment promises', () => {
  const enabled = render(TrustBadges, { shop: { ...shop, maduraiFree: true, minimumOrder: 300, gstin: '33POTPS8236C1Z7', upiEnabled: true } });
  for (const text of ['Free delivery in Madurai', 'Minimum order ₹300', 'GST invoice', 'Secure UPI payment']) assert.ok(enabled.includes(text));
  const pending = render(TrustBadges, { shop: { ...shop, maduraiFree: false, minimumOrder: 0, gstin: '', upiEnabled: false } });
  assert.match(pending, /No minimum order/);
  assert.match(pending, /UPI payment setup pending/);
  assert.doesNotMatch(pending, /Free delivery in Madurai|Secure UPI payment/);
});

test('footer includes every supplied business field and original credit mark except removed admin login', () => {
  const business = { ...shop, legalName: 'Suriyaprakash S', gstin: '33POTPS8236C1Z7', phone: '+91 80153 03041', email: 'vksveltradersellur@gmail.com', address: '9, Jancyrani Puram 3rd Street, Sellur, Madurai, Tamil Nadu 625002', footerText: 'Genuine branded products, GST billing and doorstep delivery across Madurai.', openingHours: '9 AM–8 PM', maduraiFree: true, minimumOrder: 300 };
  const html = render(StoreFooter, { shop: business, onOrders: noop });
  for (const key of ['legalName', 'gstin', 'phone', 'email', 'address', 'footerText', 'openingHours']) assert.ok(html.includes(business[key]), key);
  assert.match(html, /Proprietor: /);
  assert.match(html, /Free delivery within Madurai/);
  assert.match(html, /Min. order ₹300/);
  assert.match(html, /techly-mark.svg/);
  assert.match(html, /My Orders/);
  assert.doesNotMatch(html, /Admin login/);
});


test('product details show actual specifications and default to an available color with inclusive GST', () => {
  const html = render(ProductDetails, { product: { ...product, specifications: [{ label: 'Material', value: 'Copper' }], variants: [
    { id: 'white', name: 'White', color: '#fff', stock: 0, price: 120 },
    { id: 'blue', name: 'Blue', color: '#00f', stock: 2, price: 150 },
  ] }, gstInclusive: true, gstRate: 18, onAdd: noop, onClose: noop });
  assert.match(html, /Features &amp; Specifications/);
  assert.match(html, /<th scope="row">Material<\/th><td>Copper<\/td>/);
  assert.match(html, /Inclusive of 18% GST/);
  assert.match(html, /Selected color: Blue/);
  assert.match(html, /aria-pressed="false" disabled=""/);
  assert.doesNotMatch(html, /Unavailable<\/button>/);
});

test('GST wording uses saved order mode and preserves legacy receipts', () => {
  const totals = { subtotal: 100, discount: 0, delivery: 0, gst: 18, total: 118, gstRate: 18, gstInclusive: false };
  assert.match(render(CheckoutTotals, { totals }), /GST \(18%\) added/);
  assert.match(render(CheckoutTotals, { totals: { ...totals, gstInclusive: true } }), /GST \(18%\) included/);
  assert.match(render(CheckoutTotals, { totals: { ...totals, gstRate: undefined, gstInclusive: undefined } }), /GST included/);
});

test('every category supports an optional plain color name below the description, without requiring a swatch', () => {
  for (const categoryId of ['paints', 'wires', 'lighting', 'hardware']) {
    const draft = { ...product, categoryId, colorName: 'Dark Red <script>', customShadeEnabled: false };
    const html = render(ProductDetails, { product: draft, gstInclusive: true, gstRate: 18, onAdd: noop, onClose: noop });
    assert.match(html, /Product details<\/p><section[^>]+aria-labelledby="product-color-title"><h3 id="product-color-title">Color<\/h3><p[^>]*>Dark Red &lt;script&gt;<\/p>/);
    assert.doesNotMatch(html, /Choose a wire color|Available colors|<script>/);
    const editor = render(ProductEditor, { draft, categories: catalog.categories, gstInclusive: true, setDraft: noop, onSave: noop, onClose: noop });
    assert.match(editor, /Product color name \(Optional\)<\/span><input maxLength="80"/);
  }
  const props = { gstInclusive: true, gstRate: 18, onAdd: noop, onClose: noop };
  assert.doesNotMatch(render(ProductDetails, { ...props, product }), /product-color-title/);
  const variant = render(ProductDetails, { ...props, product: { ...product, colorName: 'Base color', variants: [{ id: 'blue', name: 'Blue', color: '#00f', price: 236, stock: 3 }] } });
  assert.match(variant, /id="product-color-title">Color<\/h3><p[^>]*>Blue<\/p>/);
  assert.doesNotMatch(variant, /Base color/);
});

test('paint custom code input, catalog action and admin control respect product settings', () => {
  const paint = { ...product, categoryId: 'paints' };
  const props = { product: paint, gstInclusive: true, gstRate: 18, onAdd: noop, onClose: noop };
  const html = render(ProductDetails, props);
  assert.match(html, /Custom shade \/ color code/);
  assert.match(html, /maxLength="80"/);
  assert.match(html, /aria-describedby="custom-shade-help"/);
  assert.match(html, /extra shade charge will be discussed separately/);
  assert.doesNotMatch(render(ProductDetails, { ...props, product: { ...paint, customShadeEnabled: false } }), /id="custom-shade-code"/);
  assert.match(render(ProductCard, { product: paint, categoryName: 'Paints', quantity: 1, onAdd: noop, onDecrease: noop, onOpen: noop }), /Choose shade/);
  assert.match(render(ProductEditor, { draft: paint, categories: catalog.categories, gstInclusive: true, setDraft: noop, onSave: noop, onClose: noop }), /Allow a custom shade \/ color code/);
});

test('admin orders, customer receipt and payment summary show selected shade and exact custom code safely', () => {
  const order = { id: 'VKST-1099', createdAt: '2026-10-15T10:00:00Z', status: 'Pending Payment', customer: { name: 'Customer', phone: '9876543210', city: 'Madurai' }, payment: { status: 'UNPAID', method: 'UPI', expiresAt: '2026-10-15T11:00:00Z' }, items: [{ productId: 'paint', name: 'Paint', quantity: 1, price: 118, shade: 'Dawn', customShadeCode: '#H10873<script>' }], subtotal: 118, discount: 0, delivery: 0, gst: 18, total: 118 };
  for (const html of [render(OrdersTable, { orders: [order], onVerify: noop, onStatus: noop }), render(OrderDetails, { order }), render(Payment, { order, setOrder: noop, done: noop })]) {
    assert.match(html, /Color: Dawn/);
    assert.match(html, /Custom shade code: #H10873&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  }
});

test('the shade chart exposes named color buttons, search, groups and a selected preview', () => {
  const html = render(PaintShadePicker, { value: 'ww0029', onChange: noop });
  assert.match(html, /Search shade name or code/);
  assert.match(html, /Color family/);
  assert.match(html, /133 shades/);
  assert.match(html, /aria-label="Jasmine, WW 0029" aria-pressed="true"/);
  assert.match(html, /Selected paint shade/);
  assert.match(html, /Clear selected paint shade/);
  assert.match(html, /Screen colors are approximate/);
  assert.equal((html.match(/aria-pressed=/g) || []).length, 133);
});

test('the customer picker uses live shade images and exposes an editable number without showing hidden shades', () => {
  const card = [{ id: 'saved', code: 'SHOP 77', name: 'Workshop blue', brand: 'Shop card', family: 'Blue', color: '#225588', enabled: true, imageUrl: '/api/media/uploads/00000000-0000-4000-8000-000000000001.webp' },
    { id: 'hidden', code: 'HIDDEN', name: 'Hidden shade', brand: 'Shop card', family: 'Blue', color: '#225588', enabled: false }];
  const html = render(PaintShadePicker, { card, value: 'SHOP 77', onChange: noop });
  assert.match(html, /aria-label="Workshop blue, SHOP 77" aria-pressed="true"/);
  assert.match(html, /src="\/api\/media\/uploads\/00000000-0000-4000-8000-000000000001.webp"/);
  assert.match(html, /Custom shade \/ color code \(editable\)/);
  assert.match(html, /id="custom-shade-code"[^>]*maxLength="80"[^>]*value="SHOP 77"/);
  assert.doesNotMatch(html, /aria-label="(?:Hidden shade|Jasmine),/);
  const custom = render(PaintShadePicker, { card, value: 'SHOP 78', onChange: noop });
  assert.match(custom, /Your custom shade code:/);
  assert.doesNotMatch(custom, /Selected paint shade/);
});
