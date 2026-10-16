# VKS VEL TRADERS: secure tracking and browser notifications

## Architecture and migration

The existing Next.js storefront/admin, NestJS API, PostgreSQL/Garage storage and
admin authentication are retained. There are no customer accounts or verified
phone OTPs. Customer authorization therefore uses **per-order receipt capabilities**,
not a phone-number-based account list.

New orders return a random 256-bit `trackingToken` once. Only its SHA-256 hash is
stored in the order JSON; public order responses omit the hash. The customer browser
stores up to 50 receipt tokens locally. An active-order badge counts the same saved,
authorized order list, excluding Delivered and Cancelled. It refreshes every 15
seconds while visible, on focus, storage changes and push-worker messages. The count
is device/browser-specific, not all orders ever placed with the same phone number.

The additive startup DDL creates:

- `vks_order_events`: a unique `(order_id, version)` event for a committed status change.
- `vks_push_subscriptions`: order-bound endpoints, browser encryption keys and the
  receipt capability, encrypted together using AES-256-GCM; endpoint hashes support
  uniqueness. Each order supports at most five subscribed browser endpoints.
- `vks_push_deliveries`: unique event/subscription jobs with retry count, lease and state.

Existing order JSON gains optional `trackingHash`, `statusVersion` and `history` as
used; no orders/products are deleted or recreated. Pre-upgrade orders have no invented
historical transition times: the UI shows only known timestamps. The schema is created
under the existing startup transaction/advisory lock. Event insertion and order writes
share the same transaction, so a rollback cannot send a notification. Network sends
occur outside the database transaction. This follows the PostgreSQL skill's short-
transaction and indexed-access guidance.

Existing `/`, `/admin`, quote, checkout and admin order APIs remain. The new Next.js
route is `/orders/[id]`. New-order reads, push enrollment and customer payment-reference
updates require `x-order-token`; order ID alone is never authorization. `/api/orders/lookup`
accepts a maximum of 50 `{id,token}` pairs and returns only authorized orders.

**Compatibility change:** the old phone lookup remains only for pre-token orders.
It requires the exact full 10-digit phone number, not an arbitrary suffix, and is
limited to 10 recovery attempts/minute per API-process client IP. A successful recovery
issues the secure capability once; later access needs that capability. This legacy
recovery is not phone ownership verification. Configure an edge rate limit for this
endpoint across replicas, and use an OTP/customer-account system if stronger recovery
is needed. Lost tokens for new orders cannot be recovered by knowing ID + phone alone.
Staff must verify the customer through their normal support process; this release does
not add a token-reset or customer-authentication mechanism.

## Notifications and delivery behavior

Order Placed, Payment Confirmed, Confirmed, Processing, Packed, Shipped, Out for
Delivery, Delivered and Cancelled events are supported. Admin payment verification
also queues Payment Confirmed when it changes the order status. Existing stock and
payment rules are unchanged. Status repeated without change does not create an event.

The customer explicitly clicks Enable notifications on an order receipt/tracking
page. No permission prompt appears on page load. Denial, unsupported browsers,
unconfigured server keys and enrollment errors leave tracking usable. Subscribing
queues the current event once; changes before the customer subscribes are not replayed.
Each order requires separate opt-in. Turn off for this order removes that device's
server enrollment without disabling updates for other subscribed orders.

An API worker polls every five seconds. Row leases and `SKIP LOCKED` coordinate replicas.
Transient failures retry with backoff, at most five attempts; 404/410 removes expired
subscriptions; 400/401/403 fails the job. Jobs/push messages older than a day are not
sent. The worker logs no endpoints, keys, receipt tokens or customer details. Monitor
failed/pending counts and application warnings; do not query/decrypt subscription blobs
for routine diagnostics. Back up PostgreSQL plus the encryption key securely. Establish
an appropriate retention policy for old events/subscriptions; this release does not
automatically purge historical records.

The notification includes VKS VEL TRADERS, order ID, status and a short message, but no
address, phone, item list or payment reference. Clicking opens that exact order with a
token in the URL **fragment**, never a query parameter. Fragments aren't sent to the
server in HTTP requests; the page validates the capability, saves it and removes the
fragment from the address bar when local storage succeeds. Treat copied receipt links
as secrets: anyone with the link can read that order. Do not paste them publicly.

The worker uses a stable event tag and IndexedDB receipt IDs to suppress repeated
display, including transport retries. Web Push is not an exactly-once transport:
a crash after sending but before marking success may retry the same event. Device
storage clearing or blocked IndexedDB can weaken deduplication; the stable notification
tag still avoids stacking copies. **Notifications require permission and an active
subscription and are never guaranteed.** OS restrictions, revoked permissions, offline
devices, push-provider outages and battery settings can delay or prevent delivery.

## Environment variables (NestJS API only)

| Variable | Purpose |
| --- | --- |
| `VAPID_PUBLIC_KEY` | Public application-server key returned by `/api/push/config`. |
| `VAPID_PRIVATE_KEY` | Private signing key; never expose through `NEXT_PUBLIC_*`. |
| `VAPID_SUBJECT` | Real operator contact, e.g. `mailto:owner@your-domain.example`. |
| `PUSH_ENCRYPTION_KEY` | 64 hex characters (32 random bytes), protects saved subscriptions. |

With missing values, notifications are disabled but checkout/tracking remain usable.
Generate keys once in a trusted terminal after installing backend dependencies:

```sh
npx web-push generate-vapid-keys --json
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Store output in Dokploy's secret environment editor/password manager, not Git,
screenshots, deployment logs or chat. Keep VAPID and encryption keys stable across
deployments. Changing encryption keys without re-encrypting records makes them unreadable;
changing VAPID keys requires browser re-enrollment. Do not run key-generation during build.

## Deployment

1. Back up PostgreSQL and existing deployment secrets. Deploy matching frontend and
   backend together; this also includes the previously requested supplied-banner work.
2. Add the four variables in Dokploy Environment. The backend `compose.yaml` forwards
   them only into `api`. Existing `AUTH_SECRET`, database/Garage settings and frontend
   routing remain as configured. No new database or public container port is required.
3. Serve the storefront over valid HTTPS at its normal origin. Keep `/api` proxied to
   the API (or configure existing CORS for the exact storefront origin). Never cache
   `/api/orders*`, `/api/push/orders*` or tracking HTML at the CDN/reverse proxy.
4. Redeploy the unified Compose stack. Startup applies idempotent additive DDL. Confirm
   the API is healthy and `GET /api/push/config` reports `enabled: true`. Only the public
   VAPID key should appear in that response.
5. Verify `/sw.js` returns JavaScript, not SPA HTML or a login redirect, with no-cache
   headers and scope `/`. `/manifest.webmanifest` and `/brand/shop-logo.png` must load.
   The worker has **no fetch handler**: customer data and API responses are not cached.
6. Open an authorized test order, click Enable notifications and accept the browser
   prompt. Change its status using admin; inspect the tracking link and confirm delivery.

Browser subscriptions are accepted only for HTTPS endpoints at `fcm.googleapis.com`,
`updates.push.services.mozilla.com` or `web.push.apple.com`. This SSRF allowlist covers
the intended Chrome/Firefox/Safari providers, not every browser's proprietary endpoint.
Outbound HTTPS to those push services must be permitted from the API container.

## Browser requirements and manual acceptance checklist

Desktop Chrome/Firefox and supported Android browsers require HTTPS, permission and
a valid service-worker subscription. Localhost is a development exception. On iOS/iPadOS,
Web Push requires a supported version (16.4+) and opening the site as a Home Screen web
app; a normal Safari tab is not equivalent. Private modes and embedded browsers may
disable storage or push. Print uses the browser dialog; PDF export options vary by browser.

Before enabling production notifications, check with real devices:

- Desktop Chrome: allow, deny and reset permission; reload and re-enroll; close the
  tab and change admin status; click the OS notification to the exact receipt.
- Android Chrome: foreground/background delivery and click-through; rotate the screen;
  verify readable receipt/timeline, Copy ID, and browser print/share/PDF behavior.
- iOS Home Screen web app: user-gesture permission, background delivery and click routing.
- Repeat a status save, send multiple transitions, switch to another order, revoke the
  subscription, simulate expired endpoints/offline API, and verify no cross-order data.
- Test missing/wrong tokens, a known order ID alone, and a valid token from another order.
- Confirm printed details include the ID/reminder, status/history, products, charges,
  payment and delivery but omit navigation, push buttons and the private tracking link.

## Automated verification and limits

Run `npm run build`, `npm test`, and
`node --experimental-strip-types --test frontend/tests/*.spec.mjs` from the monorepo.
API tests use isolated PostgreSQL/Garage containers and a mocked push transport, not
the live shop or a real customer's push subscription. Tests cover persisted transitions,
rollback/no duplicates, encrypted enrollment, ownership, retries/expired subscriptions,
service-worker push/click handlers, permission handling, saved-order counts and copy/print.
Worker tests execute the actual worker with simulated browser APIs. They do **not**
replace the real-device checklist. No live Chrome/mobile delivery was verified in this
development session because no browser connection was available.

Verification completed in this session: production build, 29 backend tests, 48
frontend tests, Compose configuration validation and production HTTP checks for the
tracking route, private/no-index headers, worker scope/cache headers, manifest and logo.
No production VAPID secrets were generated or deployed. Backend dependency auditing reports
7 advisories (2 high, 4 moderate, 1 low), involving NestJS/Express upload/parser
dependencies. A separate dependency upgrade/review is needed; no breaking NestJS
major-version upgrade was applied as part of this feature.

Primary references: [web-push library](https://github.com/web-push-libs/web-push),
[PushManager permission/subscription](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe),
[notification click behavior](https://web.dev/articles/push-notifications-notification-behaviour),
[Apple Web Push requirements](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).
