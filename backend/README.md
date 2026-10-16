> This API is part of the combined [vksveltrades-Ecommerces](https://github.com/techlyai/vksveltrades-Ecommerces) repository. Use the [root README](../README.md) and root `compose.dokploy.yaml` for the complete deployment. Standalone instructions below are optional.

# VKS Vel Traders API

NestJS backend workspace in [vksveltrades-Ecommerces](https://github.com/techlyai/vksveltrades-Ecommerces).

## Secure order tracking and notifications

Status updates commit with unique notification events; a background worker sends
encrypted Web Push subscriptions outside the transaction. New customer reads and
payment-reference submissions require an order-specific receipt token. Startup adds
three notification tables without recreating existing order/catalog records.
See [migration, VAPID configuration, deployment and test requirements](docs/ORDER_NOTIFICATIONS.md).
Push is opt-in and disabled until all four notification environment variables are set.

## Storage

PostgreSQL is the only persistent source of shop records. Garage S3 is the only
persistent source of uploaded photos. There is no JSON-file or local-upload
fallback. Missing connection settings fail startup; unavailable storage fails
readiness and requests instead of returning an empty shop.

The database stores each product, category, order, banner, customer category and
delivery rule as a separate JSONB record in `vks_entities`, keyed by kind and ID.
Shop settings, schema version and revision are in `vks_store`. This preserves the
existing API contracts while moving persistence to SQL, not a JSON file.
Short transactions acquire the shop row lock, load fresh records, execute business
rules, and commit all changes together. This serializes stock reservations across
API processes and rolls back failures. PostgreSQL uses a bounded connection pool
and timeouts. Image transfers never hold a database transaction open.
This design is suitable for a small single shop; it loads the catalog/orders for
each business request. High-volume stores should evolve to indexed, entity-specific
queries instead of increasing replicas to bypass this serialization.

On first startup the API creates version 1 tables and shop defaults in the
configured schema; the schema must already exist. A one-time `shop-categories-v1`
migration installs the owner's 11 departments on both new and existing databases.
It adds no products, stock, orders or sample counts. Existing categories with the
same ID or name are preserved, including disabled and renamed categories. After
the migration, admin edits and deletions survive restarts (even deleting every
category). Admin, the product dropdown and storefront use these saved records;
disabled categories are hidden from the storefront. The migration marker and
category inserts commit together under the shop lock.
The Compose bootstrap creates the non-superuser `vks_app` role and its
`vks` schema. Only that application schema is owned by the runtime role.

## One Compose deployment in Dokploy

The repository-root `compose.dokploy.yaml` manages four separate containers: `web`, `api`, `postgres`,
and `garage`. Use Docker Compose 2.23.1 or newer, not Docker Stack.
Garage's configuration and the PostgreSQL bootstrap script are embedded in this
one file. No separate Garage configuration file is needed.

1. Choose `techlyai/vksveltrades-Ecommerces`, branch `main`, Compose path `./compose.dokploy.yaml`.
2. Configure the following in Dokploy Environment. Do not commit actual secrets:
   - `ADMIN_USERNAME=admin` and a strong `ADMIN_PASSWORD` (not the local test password).
   - `AUTH_SECRET`: independent random signing secret.
   - `POSTGRES_PASSWORD`: database administrator password.
   - `APP_DATABASE_PASSWORD`: different password for the non-superuser API role.
   - `GARAGE_RPC_SECRET` and `GARAGE_SECRET_KEY`: independent 64-character hex strings.
   - `GARAGE_ACCESS_KEY`: `GK` followed by 32 random hex characters.
   - `FRONTEND_URL=https://vksveltraders.techlyai.in`.
   - Optional `PAYMENT_UPI_ID`. Both apps use the selected repository commit.
3. Generate independent hex secrets with `openssl rand -hex 32`; use
   `openssl rand -hex 16` for the suffix of the Garage access key.
   Hex passwords avoid escaping problems in PostgreSQL connection URLs.
4. Point DNS A records for both domains to Dokploy. Add these domains to the same
   Compose service, using path `/`, HTTPS/Let's Encrypt, and no Strip Path:

   | Domain | Service | Container port |
   | --- | --- | --- |
   | vksveltraders.techlyai.in | web | 3000 |
   | apivks.techlyai.in | api | 4000 |

5. Preview Compose and deploy. PostgreSQL and Garage must become healthy before
   API startup. `/api/health` verifies both PostgreSQL and access to the Garage bucket.
   The frontend starts after API readiness.
6. If a PostgreSQL volume was created by the earlier infrastructure-only version,
   its initialization scripts will not run again automatically. Start storage first,
   then run `docker compose exec -T postgres sh /docker-entrypoint-initdb.d/10-vks-app.sh`
   once to create the missing app role/schema, before starting the API.
   Keep existing database and Garage credentials stable on subsequent deployments.

Do not expose PostgreSQL, Garage S3 or Garage RPC publicly. API reads/writes Garage
on its private network; browser image URLs remain `/api/media/uploads/<uuid>.webp`.
Backend/admin credentials are never passed to the frontend build.

Both application images build from this repository checkout. Configure Dokploy
to deploy changes to `main`; no separate frontend repository or `FRONTEND_REF`
is required. Keep credentials in Dokploy's environment configuration.

## Existing file-store migration

The running API never reads legacy files. Existing `store-data` is retained only
as a read-only `/legacy` recovery/import mount, not active storage. Back it up.
The importer preserves original files and refuses to replace a database that has
already been changed. Existing uploaded image URLs remain unchanged.

Keep the shop in maintenance mode while migrating. Start PostgreSQL and Garage,
but stop web/API traffic before importing. From the backend Compose checkout:

```sh
docker compose up -d postgres garage
docker compose build api
docker compose run --rm --no-deps api node dist/store/migrate-legacy.js --source /legacy/store.json
docker compose run --rm --no-deps api node dist/store/migrate-legacy.js --source /legacy/store.json --apply
docker compose up -d api web
```

The first command without `--apply` is a dry run: it validates records and every
referenced local image without writing to PostgreSQL or Garage. With `--apply`,
images are copied to Garage first, then records commit in one PostgreSQL
transaction. Conflicting image contents abort instead of being overwritten.
An interrupted import can leave unreferenced objects but cannot partially commit
shop records. A successful import cannot be repeated over a modified database.

For a host JSON file, build the API and run
`node --env-file=.env dist/store/migrate-legacy.js --source /absolute/path/store.json --apply`.
Uploaded images must be in an `uploads` directory beside that source file.
The owner explicitly requested display samples in this release. A one-time
`requested-display-samples-v1` migration adds one labelled sample product per
existing category and three initial sample banners (superseded by the owner-artwork migration below). Products
have a placeholder price of ₹100 and zero stock (not orderable). Replace their
details/photos/prices and stock them before selling, or delete them in Admin.
Existing products/banners are preserved; later edits/deletions are not reset on
restart. No mock orders, customer information or dashboard totals are generated.

## Reference footer import

`reference-footer-details-v1` runs once and fills blank business contact fields,
GSTIN, proprietor name and footer copy from the owner's reference HTML. Existing
admin values and later edits/deletions are preserved. No tax, minimum-order,
delivery or payment rules are changed. Optional `openingHours` is editable;
the reference had no hours. Public catalog settings include `upiEnabled` for
the payment badge, but continue to omit the UPI identifier and merchant details.

## Guest wishlist API

Deploy frontend and backend together. `GET /api/wishlist` and
`PUT|DELETE /api/wishlist/:id` require `Authorization: Wishlist <64-hex-key>`.
The frontend generates this random 256-bit key and stores it locally. PostgreSQL
stores only its SHA-256 hash plus up to 200 product IDs in `vks_wishlists`.
This is browser-specific persistence, not customer-account authentication or
cross-device sync; admin authentication is unchanged. Clearing browser storage
loses access. Use HTTPS. Queries exclude hidden/deleted catalog items; per-owner
row locks prevent concurrent updates from losing products. Include this table in
normal PostgreSQL backups. Tests use disposable database schemas and containers.

## Local development and tests

Requires Node.js 22, PostgreSQL and Garage. Copy `.env.example` to `.env`,
replace placeholders, and set host-reachable `DATABASE_URL` and `S3_*` values.
The monorepo root Compose publishes storage only on loopback for local development;
this backend-repository Compose publishes no host ports.

```sh
npm ci
npm run build
node --env-file=.env dist/main.js
npm test
```

`npm test` requires Docker. It creates separate disposable PostgreSQL/Garage
containers with generated test credentials, tests real persistence, concurrent
orders, rollback, cancellation, image upload/read/restart, readiness failure and
legacy import, then removes only those test resources. Existing shop containers
and volumes are not used.

## Owner-supplied banners

Startup migration `owner-banner-artwork-v1` imports 13 owner-supplied banners once,
using JPEGs bundled in the matching frontend at `/banners/*.jpeg`. It sets current
banner durations and the shop interval to 2 seconds and enables automatic rotation.
Only untouched sample banner placeholders are disabled; customized banners remain.
Imported banners can be edited, disabled or deleted in admin and are not restored
on restart. The import runs in the existing short startup transaction/lock and does
not modify delivery, tax, stock or payment configuration. Deploy frontend assets
before the backend migration (or deploy both with the unified Compose stack).

## Customer Type checkout dropdown

Checkout uses one required dropdown, defaulting to Customer (standard price).
The three public choices are Customer, Engineers and Electricians. The API uses
saved product/variant prices, merges repeated cart lines, applies exactly one
customer-type discount and adds the existing delivery charge. Engineers receive
5% and Electricians 10% only when the product subtotal is **greater than ₹5,000**;
₹5,000 itself receives no discount. Customer always receives 0%.

All amounts are calculated in paise on the server. Quotes are refreshed after
customer type/cart/address changes once required delivery details are valid;
stale responses are discarded. The saved order, UPI link/QR and printable order
receipt use the same final amount. New order JSON snapshots include the applied
`discountPercent` and `customerCategoryId`; older orders retain their original
amounts and remain readable. Unknown or non-public category IDs are rejected, not silently
replaced. The frontend submits no authoritative prices, discounts or totals.

On API startup, the one-time `checkout-trade-tiers-v1` data migration updates or
adds these three rules in the existing `customerCategories` records. Matching
legacy Engineer/Engineers and Electrician/Electricians records retain their IDs.
Unrelated categories remain in admin storage but are not accepted by public
checkout; all existing order records are untouched. The migration
uses the existing startup advisory lock, shop-row lock and atomic upsert; no new
table/column, route or environment variable is required. It does not reset later
admin edits on each restart. Existing admin discount configuration remains usable.

Back up PostgreSQL, deploy the matching API and frontend, then check the three
dropdown options. Do not remove database volumes. The automated API tests cover
all three types at ₹4,999, ₹5,000 and ₹5,001, variant and quantity changes, rounding,
tampering, repeated quotes, concurrent migration startup and historical receipts.
Frontend tests cover dropdown markup, selection, stale-quote cancellation,
summary/receipt percentages and exact UPI amounts. Desktop/mobile browser visual
testing is still a separate deployment check.

## Uploads and backups

Checkout validation rejects missing or whitespace-only customer/address fields
with HTTP 400 and a `fields` map for inline frontend errors. Mobile numbers require
ten digits starting with 6–9; pincodes require six digits starting with 1–9.
UPI references retain the 10–22 alphanumeric-character rule. Deploy the matching
frontend for required markers and field errors. No schema or route migration is
needed; pricing, reservations and payment verification are unchanged.

Authenticated `POST /api/admin/uploads` accepts one JPEG/PNG/WebP up to 5 MB.
Image bytes are decoded, metadata stripped, and converted to WebP before writing
to the private Garage bucket. Saving a product/category/banner/logo publishes
the returned URL; cancelling a form leaves an unreferenced object.
Missing images return 404; unavailable storage returns 503.

Back up PostgreSQL with database-aware backups, and back up both Garage metadata
and object data off-server. Named volumes survive ordinary redeployment; never run
`docker compose down -v` unless deliberately erasing data. Preserve the Compose
project identity so deployments reuse their volumes.

This single-node Garage setup has no redundancy and is for testing; production
storage needs multiple failure domains. Verified payment-provider webhooks and
dependency advisory review are still required before accepting real payments.

## Admin order notification sounds

The four built-in sounds, test button, volume slider and custom upload are functional.
After admin login, click **Enable order sounds** once for that browser session
(or use **Play test sound** in Settings). Choose a sound and volume, then **Save
changes**. Browser audio policies require user activation; audio cannot be
guaranteed in a muted, sleeping or closed browser.

The authenticated panel checks for new order IDs every five seconds across all
admin tabs and refreshes the active-order badge. Orders already present at login
are silent, repeated responses do not replay alerts, and a batch of new orders
plays one sound. Muted orders are marked seen, so enabling sound later does not
replay them. Logout stops playback and polling. Background tabs can be throttled
by the browser; returning to the tab checks for new orders.

Custom audio accepts formats the browser can decode (typically MP3/WAV/OGG),
up to 5 MB and 15 seconds. The browser converts it to PCM WAV; the API validates
the bytes, channels, sample rate, duration and size again. Files use the existing
Garage bucket; the selected URL and preferences use the existing PostgreSQL shop
JSON. Upload success still requires **Save changes** to apply the selection.
Custom clips are public shop assets, like uploaded shop images.

API additions:
- `GET /api/admin/order-alerts`: admin-only order IDs, timestamps, active count and sound preferences.
- `POST /api/admin/order-sounds`: admin-only multipart `file`, bounded PCM WAV up to 3 MB.
- `GET /api/media/order-sounds/:uuid.wav`: audio/wav with nosniff and immutable caching.

Deploy the matching frontend and API releases. No new environment variables,
database columns or migrations are required. Preserve the existing database and
Garage volumes. This open-panel sound feature is separate from customer Web Push
notifications.

## Department banners with brands, animation and paint video

Startup migration `category-banners-v1` adds five department banners once: Paints &
Finishing, Hardware & Tools, Electrical Products, Plumbing Products and Cement &
Construction. Each lists its "Brands in stock" and links to its category. Paints plays
the bundled `/banners/paints.mp4` (muted, looping, with `/banners/paints-poster.jpg`
as its first frame) for 10 seconds; the others show the owner's photos as floating
cards for 5 seconds. Owner brand banners still using bundled `/banners/*.jpeg` artwork
are disabled, not deleted; banners with uploaded photos are unchanged.

Banners gain optional `brands` (up to 12 names), `videoUrl` (`.mp4`/`.webm`, https or
local path) and `gallery` (up to 2 extra image URLs), all editable in Admin → Banners.
Copy, brand chips and photos animate in on every slide; reduced-motion preferences
turn the animations off and keep the video paused on its poster. Deploy the matching
frontend (it ships the video) and API together. No new tables or environment variables.

Plumbing uses a transparent product photo: banners marked `cutout` (Admin: "Photo has a
transparent background") show the image directly on the banner with a floor shadow and
pipe line art instead of a card. One-time migration `plumbing-banner-cutout-v1` applies
this to an untouched plumbing banner only. Astral, CERA, LEO, Watertec and Sproxware
chips show logos cropped from the supplied artwork (`public/brands`, light backgrounds made
transparent, logo artwork untouched); other
brands, or a logo that fails to load, show the brand name. A missing shop logo falls
back to the bundled original, then to no image, never a broken icon.

Department banners now match the owner's mockups. Banners have an optional `theme`
(plumbing, electrical, paints, cement, hardware; Admin "Banner style") that sets the
blue-to-cream background, gradient headline word and button. Plumbing, Electrical, Cement
and Hardware show product artwork cropped from the mockups (`/banners/dept-*.webp`) with
feathered edges; Paints keeps its video over paint strokes. "Brands we stock" chips show
logos for all fourteen listed brands. One-time migration `department-banner-artwork-v1`
updates department banners still on an earlier release's image; admin-uploaded photos stay.

## Product specifications, colors and GST

Product create/update endpoints accept optional `specifications` label/value rows and `variants` with IDs, names, hex colors, prices and stock. NestJS validates and persists these fields. Customers must select a valid color when variants exist; price and stock are resolved on the server.

GST uses the saved shop-wide `gstRate` and `gstInclusive` settings after customer discounts. Exclusive GST is added to the payable total; inclusive GST is extracted from the price. New orders snapshot both settings so historical receipts keep their original tax labels. Existing shop settings and old orders are preserved. Deploy the matching frontend. No database schema migration or new environment variables are required.

## Admin password changes

For changing the administrator password in Settings, see [admin password changes](docs/admin-password.md). The API automatically creates a separate credential table; no database reset or new environment variables are required. After a password change, the database credential takes precedence over the initial `ADMIN_PASSWORD` value.

## Custom paint shade codes

The shared shade card is editable through authenticated `/admin/paint-shades` endpoints. Admins can add/edit shade numbers, names, colors and uploaded images, or hide a shade. The original 133 entries remain defaults; edits persist in existing PostgreSQL shop data. See [shade management](docs/paint-shade-management.md). Deploy the matching frontend; no database reset or schema migration is needed.

Quote/order cart items accept optional `customShadeCode` text (up to 80 characters, no control characters; surrounding whitespace is trimmed). The code is saved on the order item alongside the selected variant's shade and price, and returned to customers and authenticated admins. Different codes remain separate lines; stock validation totals all lines for the same product and variant before reserving inventory. Cancellation releases all those reservations normally.

Products accept optional boolean `customShadeEnabled`. When absent, custom codes are enabled only for category `paints`; an explicit true/false overrides the default. Codes on disabled products are rejected. The code never sets a price, tax rate or surcharge: existing server pricing and GST remain authoritative, with any extra shade charge discussed separately. Existing orders need no backfill. Deploy the matching frontend and API together; optional fields use existing PostgreSQL JSON records without a schema migration.

## Wire color inventory

Authenticated `PUT /api/admin/products/:id/colors` accepts `variants` and `expected` (the previous price, stock and variants). Updates run in the existing serialized PostgreSQL transaction. Stale inventory snapshots return 409; invalid names, swatches, prices, quantities and duplicate names are rejected. Product edits cannot remove a color used by an open order, or convert base inventory while an open order uses it.

The frontend adds Admin → Wire colors and preset/custom color editors. Saved product variants remain authoritative for customer selections, prices and stock; historical order snapshots remain unchanged. Deploy both repositories together. No migration, reset or new environment variable is needed. No live colors, inventory or orders are changed automatically.

## Product photo galleries and optional colors

Products also accept optional `colorName` text for every category, trimmed to at most 80 characters with control characters rejected. Empty/absent names remain valid. It is descriptive metadata and never changes prices or stock. Quote/order items snapshot it in the existing `shade` field when there is no selected variant; selected variant names take precedence. Existing order snapshots are unchanged when the product's name is edited later. Existing product JSON stores the new field without a migration.

Product creation accepts `imageUrls`, an array of up to four URL strings. Slot 1 is required; slots 2–4 may be empty strings or omitted. The main photo is also returned as `imageUrl` for older clients. Legacy create requests with only `imageUrl` remain supported. Editing only `imageUrl` preserves additional photos; edits that do not include either image field preserve existing image data. Explicit removal of the main photo is rejected, without promoting an optional photo.

The existing authenticated upload endpoint accepts JPEG, PNG and WebP up to 5 MB each, checks the decoded format, rotates/resizes images to fit 2400×2400 and stores optimized WebP in Garage. Photo URLs persist with existing PostgreSQL product JSON; no migration, reset or new environment variable is needed. Deploy the matching frontend to expose the four-slot editor and customer thumbnail gallery.

Color variants remain optional. An empty variants array is also valid in the wire-color endpoint; removing all colors retains their remaining total stock and existing product price. Stale-inventory and open-order transition checks still apply. Tests cover missing-main/max-four validation, one/four photos with and without variants, checkout/GST/reservation/cancellation, legacy edits, real uploads, optimization and persistence across an API restart. Image edits preserve inventory, prices, discounts and color variants.


## Checkout payment verification and cancellation

Checkout creates a temporary Pending Payment session. A submitted 12-digit UPI reference creates a Pending Verification request; only authenticated administrator approval records PAID and confirms it. Verify the actual bank transaction and amount before approving. No provider verification is configured. Eligible orders can be cancelled using the owning guest receipt token; collected payments require external refund processing.

Deploy with the matching frontend. Startup migration pending-checkout-status-v2 normalizes existing payment values and corrects legacy unpaid Order Placed labels in the PostgreSQL JSON records. The lastOrderNumber shop field prevents number reuse after cleanup. Existing paid orders are preserved. See API_ENDPOINTS.md for statuses, routes and guarded cleanup instructions.
