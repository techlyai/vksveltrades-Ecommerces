# VKS Vel Traders Ecommerce

Complete Next.js storefront/admin and NestJS API in one npm-workspace repository:
[techlyai/vksveltrades-Ecommerces](https://github.com/techlyai/vksveltrades-Ecommerces).
The maintained branch is `main`. Separate frontend/backend Git repositories are not required.

## Project structure

- `frontend`: Next.js storefront, checkout, secure guest receipts and admin interface.
- `backend`: NestJS authentication, catalog, server-side pricing, inventory, orders and payments.
- `frontend/docs` and `backend/docs`: feature and configuration guides.
- `frontend/scripts` and `backend/scripts`: app utilities, development and guarded cleanup tools.
- `compose.yaml`: local Docker stack with storage ports bound to loopback.
- `compose.dokploy.yaml`: production Dokploy stack; both application images build from this repository.

Frontend and backend remain separate running services. PostgreSQL persists records; Garage provides S3-compatible image storage. The production stack includes all four containers and does not fetch application source from other repositories.

## Local development

Use Node.js 22 and Docker with Linux containers.

```sh
cp .env.example .env
# Replace the placeholders in .env before starting services.
npm ci
docker compose up -d --wait postgres garage
npm run dev
```

Storefront/admin: http://localhost:3000 and http://localhost:3000/admin.
API readiness: http://localhost:4000/api/health.
Run one app with `npm run dev:web` or `npm run dev:api`.
Catalog, product prices, discounts, delivery, GST, stock and payment state are authoritative on the API.

## Build and verification

```sh
npm run build
npm test
node --test frontend/tests/*.spec.mjs
node --test backend/dist/store/order-lifecycle.spec.js backend/scripts/order-cleanup-policy.spec.mjs
```

`npm test` builds the API and provisions disposable PostgreSQL/Garage containers. Docker must be running; integration tests never use the normal shop database. Frontend and lifecycle/cleanup unit tests can run without Docker after installing/building.

## Dokploy deployment

1. Set the Git source to this repository, branch `main`.
2. Choose the repository-root Compose file `compose.dokploy.yaml`.
3. Configure the deployment environment using the variable names in `.env.example`. Supply the actual database passwords, Garage keys, admin credentials and signing secret in Dokploy. Set `FRONTEND_URL` to the storefront HTTPS origin; push keys are optional.
4. Route the storefront domain to the `web` service on port `3000`. Web proxies `/api` internally to `api:4000`; storage ports stay private.
5. Deploy the stack. Both frontend and backend builds use this checkout.

When moving an existing deployment to this repository, retain its Dokploy project/Compose project identity, environment and volume mappings. PostgreSQL data lives in `postgres-data`; uploaded files live in `garage-meta` and `garage-data`. Creating a different deployment/project can attach fresh empty volumes. Back up existing storage before changing deployment configuration. Do not remove the existing volumes.

Never commit actual `.env` files, database backups, runtime data, dependencies or secrets. This source push contains no live database records and does not itself migrate or delete live data.

## Orders, payments and history

Checkout creates a temporary **Pending Payment** session and reserves stock. Merely opening a page, scanning a QR code or following a UPI link does not confirm an order.

The customer explicitly submits a valid, unique 12-digit UPI reference with **OK / Confirm Payment**. The request stays **Pending Verification** until an authenticated administrator independently matches the actual bank transaction and amount. Approval records `PAID` and confirms the order. No provider verification/webhook is configured; references alone are not proof of payment.

Eligible customers can cancel using their secure receipt token. Cancellation releases stock once, prevents later fulfillment and indicates any refund check required. Actual refunds must be processed externally before an administrator records them. Active orders and delivered/cancelled history remain separate. Guest receipt credentials are stored in the browser; the API determines visibility and statuses. Another device needs the private receipt link because customer accounts are not implemented.

Startup migration `pending-checkout-status-v2` normalizes legacy payment values and corrects unpaid Order Placed labels in PostgreSQL JSON records. A persisted order counter prevents number reuse after cleanup. Existing order data is preserved; cleanup is never automatic.

See [API endpoints and cleanup safeguards](API_ENDPOINTS.md), [backend configuration and migration](backend/README.md), and [order notifications](backend/docs/ORDER_NOTIFICATIONS.md).
