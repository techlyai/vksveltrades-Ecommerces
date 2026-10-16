# VKS Vel Traders frontend

Next.js storefront and administrator interface. Backend source is maintained separately in [vksveltraders-backend-](https://github.com/techlyai/vksveltraders-backend-).

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

The standalone runtime copies both `.next/static` and `public`. Rebuild and
redeploy after this packaging fix so banner images, brand assets and `/sw.js`
are served. Check `/banners/cera.jpeg`, `/brand/techly-mark.svg` and `/sw.js`
return 200; no database migration or image re-upload is needed. The carousel
keeps its automatic rotation and touch swipes without visible arrows or dots.

The banner keeps the configured two-second cadence, preloads the next image and
uses a 200 ms entrance transition. Passive mouse hover no longer pauses it;
keyboard focus, touch hold and reduced-motion preferences still do. The bundled
`/banners/astral.jpeg` and older `/banners/astral-white.webp` references resolve to
`/banners/astral-transparent.webp` in storefront and admin previews. Its real alpha
channel blends the tanks into the existing banner background, with no white box.
Other banners and their backgrounds are unchanged. Custom uploads are
unchanged. This is a frontend-only update with no database migration or re-upload.

Checkout required fields display red markers and inline errors. The API also
validates the eight customer/address fields, ten-digit Indian mobile numbers,
six-digit pincodes, and UPI references. Deploy the matching API for field-specific
error responses; there are no route or schema changes.

## Catalog and photos

The shared page layout uses the exact VKS logo for `/favicon.ico` (16/32/48 px),
16/32 px PNG tab icons and a 180 px Apple touch icon. Icon links use `?v=2` to
refresh older browser caches. Redeploy the frontend and reopen old tabs if needed.
No API or database changes are required.

All products, category counts, inventory, orders, dashboard metrics, banners and shop details are read from the API. There are no bundled demo records. Empty stores display empty states. Basic branding, UI labels and layout remain static.

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
