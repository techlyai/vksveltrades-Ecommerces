# Repository Guidelines

## Project Structure & Module Organization

This repository is an npm-workspace monorepo. The Next.js storefront and admin UI live in `frontend`; routes are in `frontend/app`, interactive UI is in `frontend/components`, and API helpers/types are in `frontend/lib`. The NestJS API lives in `backend/src`; authentication is under `auth/`, while catalog, pricing, inventory, orders, payments, and seed data are under `store/`. Project documentation is in `README.md` and `SITE_DATA_AND_TECH_STACK.md`.

## Build, Test, and Development Commands

- `npm install` installs workspace dependencies and updates `package-lock.json`.
- `npm run dev` starts Next.js on port 3000 and NestJS on port 4000.
- `npm run dev:web` or `npm run dev:api` starts one application.
- `npm run build` compiles the API, then creates the Next.js production build.
- `npm test` runs the API verification command.
- `npm run lint` checks the frontend.

Copy `.env.example` to `.env` and replace every placeholder before local payment or admin testing.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, semicolons, and single quotes. Name React components, NestJS classes, and exported types in `PascalCase`; use `camelCase` for functions and variables, and kebab-case for route segments. Keep server-side pricing and inventory rules in `StoreService`; the frontend must never authoritatively calculate order totals or payment state.

## Testing Guidelines

Add focused tests for discounts, delivery matching, GST, stock reservation, order transitions, and payment verification. Name tests `*.spec.ts`. Test customer flows at mobile and desktop widths. Before submitting changes, run `npm run build` and `npm test`.

## Commit & Pull Request Guidelines

Use concise Conventional Commit subjects such as `feat: add shipment tracking` or `fix: release stock on cancellation`. Pull requests should explain behavior changes, configuration or migration needs, and verification performed. Link issues and include screenshots for storefront or admin UI changes.

## Security & Configuration

Never commit real passwords, signing secrets, bank credentials, or production payment identifiers. Validate all browser input again in NestJS. Replace the in-memory store with transactional PostgreSQL persistence before production deployment, and process payment confirmation through a verified provider webhook.
