# API Endpoints

The NestJS service uses the `/api` prefix. Admin routes require `Authorization: Bearer <token>` from `POST /api/auth/login`.

## Public Storefront

- `GET /health` — readiness check.
- `GET /catalog` — shop settings, categories, banners, products, and customer tiers.
- `GET /catalog/products`, `GET /catalog/products/:id` — product browsing and detail.
- `GET /catalog/categories`, `GET /catalog/banners` — active navigation and hero content.
- `POST /orders/quote` — server-calculated stock, discount, GST, and delivery quote.
- `POST /orders` — validates the cart and reserves stock for a temporary `Pending Payment` checkout session, not a confirmed order. Send a random 64-character lowercase hex `x-checkout-key` and reuse it for retries of the same checkout.
- `GET /orders/:id` — customer order tracking; requires `x-order-token` for token-protected orders.
- `POST /orders/lookup` — accepts up to 50 `{id,token}` credentials and returns only authorized orders.
- `POST /orders/:id/payment-reference` — requires `x-order-token`; submits a UPI UTR/reference for review.
- `POST /orders/:id/cancel` — requires the owning `x-order-token`; idempotently cancels an eligible session/order and releases its reservation once. Orders that are packed, shipped, out for delivery, or delivered cannot be cancelled.
- `GET /media/logo.svg`, `/media/products/:id.svg`, `/media/banners/:id.svg` — backend-managed artwork.

## Order notifications and legacy recovery

`POST /orders` returns a private `trackingToken` once. Store it securely and supply it
as `x-order-token`, never as a query parameter. The frontend receipt link carries it
in a fragment: `/orders/VKST-1001#token=...`. Order ID alone cannot read an order.
Pre-token orders may be recovered once with `GET /orders/:id?phone=<full-mobile>`;
later requests require the returned capability. Legacy recovery is rate limited.

- `GET /push/config` — notification availability and public VAPID key only.
- `POST /push/orders/:id` — token-authorized enrollment; standard PushSubscription JSON body.
- `DELETE /push/orders/:id` — token-authorized removal; `{endpoint}` body.

Enrollment is per order and per browser; duplicate status saves do not queue another
event. See [order notifications](docs/ORDER_NOTIFICATIONS.md) for security, migrations,
browser limitations and key configuration.

## Guest wishlist authorization

Use `Authorization: Wishlist <64-lowercase-hex-browser-key>` over HTTPS. Customer accounts are not currently supported; this is a private guest capability, not an admin token.

- `GET /wishlist` — returns `{ productIds: string[] }` for this browser; excludes hidden/deleted products.
- `PUT /wishlist/:id` — idempotently save an available product (200-product limit).
- `DELETE /wishlist/:id` — idempotently remove a product, including a no-longer-available one.

Wishlist keys are hashed in PostgreSQL. Clearing browser storage loses access to that browser's wishlist.

## Admin endpoints

- `GET /admin/paint-shades` lists the entire shade card, including hidden shades.
- `POST /admin/paint-shades` adds a shade; `PATCH /admin/paint-shades/:id` edits a stable shade record, including its number and uploaded image. Both require admin authentication. The public catalog includes only enabled shades in `paintShades`. See [shade management](docs/paint-shade-management.md).

- `POST /auth/password` requires an admin Bearer token and `{currentPassword,newPassword,confirmPassword}`. The new password must contain 12–128 characters. A successful change invalidates all existing admin sessions. See [admin password changes](docs/admin-password.md).

- `GET /admin/dashboard`, `/admin/customers`, `/admin/orders`, `/admin/orders/:id`.
- `PATCH /admin/orders/:id/status` — update fulfilment status.
- `PUT /admin/orders/:id/payment` and `POST /admin/orders/:id/verify-payment` — manage payment state.
- `PUT /admin/orders/:id/shipment` — save courier and tracking details.
- `GET|POST /admin/products`; `PATCH|DELETE /admin/products/:id`; `PUT /admin/products/:id/stock`.
- `GET|POST /admin/categories`; `PATCH|DELETE /admin/categories/:id`.
- `GET|POST /admin/banners`; `PATCH|DELETE /admin/banners/:id`.
- `GET|POST /admin/delivery-rules`; `PATCH|DELETE /admin/delivery-rules/:id`.
- `GET|POST /admin/customer-categories`; `PATCH|DELETE /admin/customer-categories/:id`.
- `GET /admin/configuration`; `PATCH /admin/configuration/shop`.

Shop records and wishlists persist in PostgreSQL. Existing order line snapshots preserve order history when a product changes.

## Checkout, verification and cancellation

Opening checkout, scanning the QR code and following a UPI link never prove payment. The customer must explicitly click **OK / Confirm Payment** and submit a 12-digit transaction reference. Repeated-digit placeholders, malformed references and references used by another order are rejected. Repeated submission of the same reference to the same order is idempotent; submitted references cannot be replaced or reused after cancellation/refund.

Payment states are `UNPAID`, `PENDING_VERIFICATION`, `PAID`, `FAILED`, `CANCELLED`, and `REFUNDED`. Order statuses remain readable labels for compatibility with the current fulfillment UI: `Pending Payment`, `Pending Verification`, `Confirmed`, `Processing`, `Packed`, `Shipped`, `Out for Delivery`, `Delivered`, and `Cancelled`. Older verified receipts retain their existing labels.

`POST /admin/orders/:id/verify-payment` requires admin authentication and a previously submitted valid reference. It records `PAID`, a verification timestamp, and `Confirmed`. The admin must independently match the bank/UPI transaction reference and amount before approving. There is no payment-provider verification API or webhook configured in this application. A reference with valid syntax is not proof that money was received.

Fulfillment and shipment mutations reject unverified and cancelled orders. Cancellation preserves collected payment state and flags a refund/check when required. For an eligible cancelled order, the administrator must process the actual refund externally before recording `REFUNDED` with `PUT /admin/orders/:id/payment`. Recording a refund does not move money.

Both customer and admin lists exclude unsubmitted checkout sessions. Submitted requests are visible as **Pending Verification** until approved. Customer active orders exclude delivered/cancelled entries; those remain in history. Browser storage holds guest receipt credentials only. The server determines order details and visibility. There are no customer accounts; another device needs the private receipt link.

At API startup, migration `pending-checkout-status-v2` corrects legacy unpaid **Order Placed** records and normalizes payment statuses in the existing `vks_entities` JSON payloads. Session/submission metadata, refund flags and verification timestamps also live there. `vks_store.shop.lastOrderNumber` prevents number reuse after cleanup. No separate payment table is introduced. Existing shop-row locks serialize reference checks, reservations and status changes across API instances.

## Development order cleanup

Run from the repository root with the intended database configuration:

```powershell
node scripts/cleanup-orders.mjs
node scripts/cleanup-orders.mjs --backup
node scripts/cleanup-orders.mjs --apply
```

The default command inspects only. `--apply` requires both `NODE_ENV=development` or `test` and a local database host; it refuses unconfirmed/production targets. Do not relabel production as development. Production cleanup requires explicit approval and a separately reviewed target list.

Before deleting anything, the tool writes a private JSON snapshot of the store, entities, order events and push records under ignored `.local/order-backups/`. It removes only unsubmitted UPI checkout records without references or collected/refunded payments. It restores outstanding reservations, avoids restoring already-cancelled reservations twice, removes related test notification records, records retired IDs, and updates the order sequence in one transaction. Paid/refunded orders, reference-bearing records, customers represented by valid orders and catalog data are preserved. Stale browser receipt credentials are pruned after a successful backend lookup. Keep backups private.
# Photo uploads

`POST /api/admin/uploads` requires an admin bearer token and multipart form field `file`. JPEG, PNG and WebP inputs are limited to 5 MB, decoded and re-encoded as WebP. The response contains `url`; save it in a product/category/banner `imageUrl` or shop `logoUrl`. `GET /api/media/uploads/:name` publicly serves uploaded shop imagery from the private Garage S3 bucket.
