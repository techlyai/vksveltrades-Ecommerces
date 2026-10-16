# Editable shade numbers and admin shade photos

## Customer flow

Open a product that allows custom shades, then choose a swatch or edit **Custom shade / color code (editable)** directly inside the shade picker. Selecting a swatch fills the number. Typing a known number selects its matching shade; typing an unlisted number sends that exact custom request without attaching the previous shade's name. The request is retained in the cart, checkout, receipt and Admin Orders. Customer edits apply to their own order and never modify the shared shade card.

## Admin flow

1. Sign in and open **Paint shades** in the Catalog section.
2. Search for a shade and choose **Edit shade**, or select **Add shade**.
3. Set the name, unique shade number/code, brand, family and preview color.
4. Use **Upload image** / **Replace image** to attach a shade photo. JPEG, PNG and WebP files up to 5 MB are supported. **Remove image** restores the plain color preview.
5. Choose whether to **Show this shade to customers**, then **Save shade**. Wait for any upload to finish before saving.

Saved edits update the shared card for all products with custom shades enabled. Hiding a shade removes its swatch from the picker; customers may still type a custom request. Codes are unique across the card (case and separators are ignored), including hidden shades. Restore a hidden shade through its existing record rather than adding a duplicate. The card supports up to 1,000 shades.

## Storage and compatibility

The original 133 Birla Opus shades remain the default card. On the first admin edit, the complete card is saved in the existing PostgreSQL shop JSON record. Later restarts and deployments preserve admin edits. Shade photos use the existing authenticated upload endpoint and Garage storage. No database reset, schema migration or new environment variable is required. Deploy the matching frontend and backend together.

The public catalog exposes enabled shades in `paintShades`. Admin-only endpoints are `GET /api/admin/paint-shades`, `POST /api/admin/paint-shades`, and `PATCH /api/admin/paint-shades/:id`. New entries require `name`, `code`, `brand`, `family`, six-digit hex `color`, and boolean `enabled`; `imageUrl` is optional and must come from the upload control. IDs are stable when numbers are edited. General shop settings cannot overwrite the shade card.

The original card's source references remain in `shade-card-sources.json`. Admin-added photos and edits are shop-maintained previews. Screen colors are approximate. Shade requests do not introduce a separate price, stock pool or GST calculation, and previous orders retain the details captured at checkout.

Verification includes duplicate-code validation, authenticated editing/upload, restart persistence, hidden-shade filtering, unchanged historical orders, simultaneous edits to different shades, desktop/mobile image controls, editable customer codes and checkout.
