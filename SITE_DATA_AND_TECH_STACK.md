# VKS Vel Traders — data and architecture

The Next.js storefront/admin reads catalog and configuration from the NestJS API. The API owns pricing, inventory, orders and payment state.

## Initial data

The category migration installs the owner's 11 departments. The explicitly requested `requested-display-samples-v1` migration adds one labelled sample product per existing category and three sample banners (three seconds per slide). Sample products cost ₹100 for display and have zero stock, so they cannot be ordered until an admin replaces their details and stocks them. Both migrations run once, preserve existing records, and never restore later deletions. No mock orders, customers, dashboard metrics or product counts are created; counts come from saved records.

## Wishlists

The shop has admin authentication but no customer accounts. Guest wishlists use a random 256-bit browser key in localStorage and a SHA-256 owner hash in PostgreSQL (`vks_wishlists`). The raw key is sent only in an authorization header over HTTPS, never in URLs or database records. Wishlists persist across refreshes and API restarts, not across devices; clearing browser storage loses access to that guest list. GET/PUT/DELETE `/api/wishlist` routes use this capability, not an admin JWT. Lists are capped at 200 products and hidden/deleted products are excluded. Per-owner row locking handles concurrent writes without locking stock/orders. No wishlist data is stored in Garage.

The `reference-footer-details-v1` migration fills blank contact information, proprietor/legal name, GSTIN and footer description from the owner's supplied HTML. It does not overwrite existing admin values or restore fields cleared after migration. Opening hours are editable (the HTML supplied none). Payment IDs remain environment-configured; tax, delivery charges and minimum-order rules are not imported from the HTML. Trust badges reflect the actual shop configuration, using a public `upiEnabled` flag rather than exposing payment identifiers. Existing file-backed data still requires the explicit, non-destructive legacy migration.

## Photos

Admin product, category, banner and shop-logo forms accept JPEG, PNG and WebP photos up to 5 MB. Save the form after uploading to publish the returned media URL. Images are validated and converted to WebP; category photos appear in the storefront menu and category rail.

Images persist in a private Garage S3 bucket. The API serves existing `/api/media/uploads/...` URLs from Garage; there is no local-file fallback. Back up Garage metadata and object data. Storefront data refreshes on focus and every 15 seconds while visible.

## Database

PostgreSQL stores shop configuration in `vks_store` and individually keyed JSONB records in `vks_entities`. Business requests use short transactions and a shop-row lock so stock reservation, order creation and updates commit atomically across API instances. Failed transactions roll back. This single-shop design loads the working catalog/orders per request; a high-volume deployment should evolve to entity-specific SQL queries. Database connections are pooled and the Compose app role is not a superuser.

## Repositories and deployment

Repository: https://github.com/techlyai/vksveltrades-Ecommerces

The `main` branch contains both applications under `frontend` and `backend`. Use the root `compose.dokploy.yaml` to build and deploy both from the same checkout. Separate source repositories are not required. Secrets, uploads, dependencies and runtime data are excluded from Git.

One Compose stack runs separate frontend, backend, PostgreSQL and Garage containers with persistent volumes. Local storage ports bind only to loopback; the Dokploy stack keeps storage entirely private. Single-node Garage has no redundancy. Redundant production storage, verified payment-provider webhooks and dependency advisory review remain necessary before production launch.
