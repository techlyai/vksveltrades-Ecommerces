> This frontend is part of the combined [vksveltrades-Ecommerces](https://github.com/techlyai/vksveltrades-Ecommerces) repository. Use the [root README](../../README.md) and root `compose.dokploy.yaml` for the complete deployment. Standalone instructions below are optional.

# VKS Vel Traders frontend

Next.js storefront and administrator interface. Backend source is included alongside this workspace in `apps/api` in the same repository.

## Secure order tracking and notifications

The new `/orders/[id]` receipt provides order history, copy/print actions and per-order
notification opt-in. The icon-only My Orders badge counts active, authorized receipts
saved in this browser. New orders use private tracking tokens, not order ID alone;
phone recovery is available only for pre-token orders. VKS is gold and VEL TRADERS is
black across the shared wordmark. See [configuration, migrations, browser limitations
and verification](docs/ORDER_NOTIFICATIONS.md). Live Chrome/mobile acceptance remains
required; automated worker tests are not OS notification delivery tests.

## Local development

Use Node.js 22. Copy `.env.example` to `.env.local`, install with `npm ci`, and run `npm run dev`. Start the backend on port 4000. Open http://localhost:3000 or http://localhost:3000/admin. Credentials are configured only on the backend; there is no built-in admin password.

Run `npm run build` to verify the production build, then `npm start` to serve it. Set `API_INTERNAL_URL` to the backend origin (without `/api`) before building. The frontend proxies `/api` including image uploads and media to that backend.

Development uses `.next-dev`; production builds and `npm start` use `.next`. Keeping these separate prevents a build from removing scripts or styles used by an active development server. After a fresh dev start, the first request compiles the page; subsequent requests use the compiled output.

If using a public cross-origin API instead, set `NEXT_PUBLIC_API_URL` to its full HTTPS `/api` URL before building and allow the frontend origin in the backend `FRONTEND_URL`. Never put admin passwords, signing secrets or payment secrets in frontend environment variables.

## Docker

```sh
docker build --build-arg API_INTERNAL_URL=http://host.docker.internal:4000 -t vks-frontend .
docker run --name vks-frontend -p 127.0.0.1:3000:3000 vks-frontend
```

The default build argument targets a backend published on the Docker Desktop host. Set it to the backend service origin appropriate for your deployment network. Rebuild after changing API routing. Use HTTPS for public deployment.

## Catalog and photos

All products, category counts, inventory, orders, dashboard metrics, banners and shop details are read from the API. The backend includes the owner's requested one-time display samples: one labelled, out-of-stock product per category. The supplied-artwork upgrade replaces untouched sample banners with 13 editable banners rotating every two seconds. Admin can edit or delete them; the frontend does not invent records or counts. Empty stores still display empty states.

The original portrait logo extracted from the reference HTML is the default; an admin-uploaded logo takes precedence. Categories use a two-column menu, selected items use gold accents, and the orders/wishlist/cart header controls are icon-only (Categories retains its label).

## Reference footer, logo and order lookup

The original portrait asset is pixel-identical to the logo supplied by the owner.
Storefront, admin sidebar and admin login use compact unpadded placement; uploaded
logos still take precedence. The footer includes editable business contact details,
GSTIN, proprietor, description, optional opening hours and the original Techly mark.
The footer admin-login link remains removed; `/admin` is unchanged.

The banner rotates automatically every two seconds without visible arrows, dots
or a pause/resume button. Touch swipes still change slides. Touch hold, keyboard
focus and reduced-motion preferences still suspend automatic rotation. Four pastel
service badges reflect actual delivery/minimum-order/GST/payment configuration,
not hardcoded screenshot values. The centred My Orders form uses the existing
secure receipt lookup (legacy ID/mobile recovery for older orders only), with loading,
errors and Continue shopping.

## Supplied banner artwork and gold storefront accents

The owner's 13 supplied JPEGs are bundled unchanged under `public/banners`.
Deploy the matching backend to import the editable banner records and set their
rotation to 2 seconds. Desktop banners use a taller full-width layout; mobile
stacks copy and artwork. Images use `object-fit: contain` to preserve poster text.
Keyboard focus, touch interaction and reduced-motion preferences pause rotation.
Passive mouse hover no longer pauses it. The next image is preloaded, with a
200 ms entrance transition. The bundled `/banners/astral.jpeg` and older
`/banners/astral-white.webp` references resolve to the optimized
`/banners/astral-transparent.webp` in storefront and admin previews. Its real alpha
channel blends the tanks into the existing banner background, with no white box.
Other banners and their backgrounds are unchanged. Custom uploads are unchanged; deploy the frontend
only with no database migration or image re-upload needed for this update.
Gold accents now cover storefront actions, selections, wishlist and cart controls.
Categories are hidden on cart, checkout and payment views. Admin delivery fields
show required stars and nonnegative charge validation.

## Public-asset packaging and checkout validation

The shared page layout links the real VKS logo as a multi-size `/favicon.ico`
(16/32/48 px), explicit 16/32 px PNG tab icons, and a 180 px Apple touch icon.
The icon links use `?v=2` to refresh older browser icon caches. Rebuild and deploy
the frontend, then reopen an old tab if it still shows the generic globe.
No API or database changes are required; the original shop logo is unchanged.

The standalone Docker runtime must include both `.next/static` and `public`.
The Dockerfile now copies the latter explicitly; this fixes missing banner JPEGs,
the Techly mark, favicon and `/sw.js` in container deployments. Rebuild and redeploy
the frontend image, then verify `/banners/cera.jpeg`, `/brand/techly-mark.svg` and
`/sw.js` return 200. No database migration or banner re-upload is needed. The 13
owner-supplied JPEGs are preserved unchanged; a failed image uses category artwork.

Checkout keeps its existing sections and responsive grid. All eight customer and
address inputs, plus the UPI reference form, have red required markers and inline
validation. Mobile numbers require ten digits starting with 6–9; pincodes require
six digits starting with 1–9. The API repeats these checks and returns field errors;
payment verification and server-calculated totals remain authoritative. Deploy the
matching API for field-specific backend errors. No route or database schema changes.

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

## Wishlist persistence

Deploy the matching backend with `GET/PUT/DELETE /api/wishlist`. A private random browser key in localStorage identifies a PostgreSQL-backed guest wishlist. This site has no customer-account login: saved products persist on the same browser, not across devices. Clearing browser storage loses access to that guest list. API failures display a retry message and never pretend a heart was saved. Header Wishlist opens the saved-items section; product hearts add/remove items. The live cart badge counts total quantities, including repeated items, and shows zero for an empty cart.

Run `node --experimental-strip-types --test tests/*.spec.mjs` for frontend component/helper checks. These are not substitutes for desktop/mobile visual testing.

Upload JPEG, PNG or WebP photos (up to 5 MB) from the product, category, banner or shop-settings form, then save that form. Uploaded photos are stored by the backend, not inside the frontend container. The shop uses the saved URLs. Visible storefront pages refresh catalog data every 15 seconds and when the window regains focus.

Admin uploads are public shop imagery: do not upload private customer documents. Configure shop details, tax, payment and delivery settings before accepting orders. The backend still requires transactional database storage and verified payment webhooks before production use. Dependency advisories also require review before public deployment.

## Floating cart summary

The floating View Cart summary stays visible on the shop and wishlist while the
cart contains products. It restores with a saved cart and hides when the cart is
empty or the customer opens the cart/checkout or a product dialog. There is no
automatic dismissal timer; the header quantity badge continues to update.

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

In **Admin → Products → Edit product**, add label/value rows under **Features & Specifications** and color variants under **Available colors**. Each color has a name, swatch, price and stock quantity. The storefront shows the specifications below the photo, selects an available color by default and carries the selection into the cart and order. Products without colors continue using their ordinary price and stock. Only enter verified product details; existing products are not populated with invented specifications or colors.

The GST rate and whether prices include it come from **Admin → Settings → GST on prices / GST rate (%)**. For an 18% configuration, product cards and details display 18%. NestJS calculates GST after the customer discount and adds it to the payable amount only for GST-exclusive pricing. New orders retain the rate and mode for accurate historical receipts; older receipts keep their existing inclusive wording. The rate remains shop-wide, and this update does not change the saved rate.

Deploy both the frontend and API for these changes. The optional product fields and order tax snapshots use the existing PostgreSQL JSON records; no database schema migration or new environment variables are required. Browser previews in `docs/screenshots/product-details-*.png` and `product-editor-*.png` use isolated test data.

## Custom paint shade codes

Customers can choose an available color, optionally enter a shade-card code (for example `#H10873`), and add the product to their cart. The code remains visible through cart reloads, checkout, payment, tracking and the printable receipt. Admin Orders shows both the chosen shade and custom code, and its search accepts either. Different codes stay on separate order lines while sharing the selected product/color's stock limit.

The listed product/color price and configured GST still determine checkout totals. No custom tint surcharge is calculated; extra charges are discussed separately with the customer, as requested in the October 15 evening voice note. This is an order annotation, not a quotation or automatic color-matching service.

Custom codes are enabled by default for products in the Paints category (`paints`). Admin can enable or disable **Allow a custom shade / color code** under **Products → Edit product → Available colors** for any product, including products without predefined colors. Codes are optional, limited to 80 characters, and validated again by the API. Deploy both repositories together; no database reset, schema migration or new environment variable is needed.

### Clickable shade card

Customers can edit their shade number directly inside the picker. Administrators can now add shades, edit names/numbers and upload, replace or remove shade photos in **Admin → Paint shades**. The card uses saved backend data, with the original 133 shades as defaults. See [shade management](docs/paint-shade-management.md) for instructions and deployment details.

The product dialog includes 133 shades from the owner's four Birla Opus card photographs: 21 in each of the five color families and 28 from Popular Combinations. Customers can filter by family, search by name or code (including `ww0029` / `WW 0029`), click a swatch, or type an exact code into the existing field to show its preview. Clearing the selection keeps ordinary purchases and unlisted custom codes available. The saved order annotation contains the brand, code and shade name, for example `Birla Opus / WW 0029 / Jasmine`, so it remains readable if the catalog changes.

Names/codes and RGB preview values were cross-checked against the [official Birla Opus catalogue](https://www.birlaopus.com/colour-catalogue). `lib/paint-shade-data.json` contains the selected card shades; `docs/shade-card-sources.json` records each official source. Screen previews are approximate and the shop must confirm compatibility with the chosen paint. These are shade requests, not separately priced or stocked product variants. The existing product switch controls both the card picker and manual code entry.

The accompanying voice note also mentioned an admin homepage jump. An isolated browser check kept an unsaved product edit open across 90 seconds of admin polling without navigation or draft loss. This does not reproduce or establish the cause of the reported live issue.

## Admin password changes

Open **Admin → Settings → Change password**. Enter the current password and a new password of 12–128 characters, then confirm it. A successful change signs out all admin sessions; sign in again using the new password. Passwords are cleared from the form and are never saved in browser storage.

Deploy the matching backend, which stores a salted password hash in PostgreSQL and preserves changes across restarts. After the first change, `ADMIN_PASSWORD` is only the original bootstrap value and no longer overrides the saved password. See [password setup and behavior](docs/admin-password.md). The live password is not changed by building or deploying this feature.

## Wire colors

Open **Admin → Wire colors → Edit colors** for a wire/cable product. Choose Black, Blue, Red, Yellow, Green, White, Brown, Grey, Orange or Green / Yellow, or add a custom color. Names and swatches are editable; each color has its own price and stock. New colors start with zero stock. Enter the real quantities before saving; the sum replaces the product stock. These controls also appear in the product editor.

Customers choose from the saved product colors. Out-of-stock colors are disabled, and the choice remains in cart, checkout, receipts and Admin Orders. Existing orders retain the original color name and price. A stale inventory edit is rejected; close the editor, reload wire products and retry. An open order must be completed or cancelled before removing its color option or converting its base stock into colors.

Deploy the matching API and frontend together. The API adds authenticated `PUT /api/admin/products/:id/colors`; existing product JSON stores the colors, without a database migration or new environment variable. Deployment does not add stock, configure colors on live products or remove orders.

## Product photos and optional colors

**Plain color names:** the October 15 voice-note update adds **Product color name (Optional)** under Product information in Add/Edit Product, for every category. Enter a name such as Red, Dark Red or Military Green; no swatch, extra price or separate stock is required. Customers see a bold **Color** heading and the name below the description. The name follows the cart, checkout and order receipt. Leave the field empty to hide the section. When selectable variants exist, the customer's selected variant name takes precedence and its price/stock rules remain unchanged. Deploy the matching API; no data migration is needed.

In **Admin → Products → Add Product / Edit product**, use the four slots under **Product images**. Upload the required main photo, and optionally add photos 2–4. Each slot has its own preview, Replace and Remove buttons. JPEG, PNG and WebP files up to 5 MB each use the existing automatic resizing and WebP optimization. Wait for uploads to finish, then save. Removing the main photo requires a replacement before saving; additional photos never silently become the main photo.

Customers see the main photo on product cards and a thumbnail gallery in product details when additional photos exist. Existing single-image products open normally in the editor. Product colors are optional in both the product editor and Wire colors; products without colors use their ordinary price and stock. If colors are supplied, their existing price, stock and checkout rules still apply. Removing all wire colors uses their remaining total stock, subject to the existing open-order protection.

Deploy the matching API and frontend together. Products save `imageUrls` (up to four slots) and retain `imageUrl` as the main-photo alias for older clients. The existing PostgreSQL JSON records and Garage image storage require no migration, reset or new environment variable. Existing photos, prices, stock, discounts and color variants are preserved by image-only edits.

Verified product creation with one/four photos without colors and with optional colors, edit compatibility, independent replacement/removal, failed upload retry, concurrent uploads, mobile/desktop galleries and checkout. Preview screenshots: [desktop admin](docs/screenshots/product-images-admin-desktop.png), [mobile admin](docs/screenshots/product-images-admin-mobile.png), [desktop gallery](docs/screenshots/product-gallery-customer-desktop.png), [mobile gallery](docs/screenshots/product-gallery-customer-mobile.png).


## Checkout, manual payments and order history

Deploy with the matching backend payment-lifecycle update. Checkout remains Pending Payment until the customer explicitly submits a valid reference using OK / Confirm Payment. It then stays Pending Verification until the shop checks the bank transaction and approves it. Opening a QR code or UPI link never confirms payment.

Cancel Order is available on the payment summary, secure receipt and My Orders for eligible orders. Cancellation requires confirmation, updates backend status and shows any refund check needed. Active orders and history are separated. Browser storage contains guest receipt credentials; the server determines order visibility and payment state. Another device requires the private receipt link because customer accounts are not implemented.
