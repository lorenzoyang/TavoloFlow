# Qiao TavoloFlow

A self-hostable dine-in QR ordering app for small restaurants. Guests order from their phones; staff
manage the floor, kitchen and pass; owners confirm offline payment and review closed bills.
Platform administrators manage restaurants, accounts and service periods.

The guest, store and platform interfaces support **English, Italian and Chinese**. Staff can install
the store area as a PWA for phones and kitchen/counter tablets. The app does not process online
payments or replace a fiscal cash register.

## What it does

- Menu management with translated names, photos, prices, allergen review and sold-out state.
- Fixed table QR codes, printable table cards, explicit opening and optional guest join codes.
- Tab-local carts, shared table orders, immutable snapshots and idempotent submission recovery.
- Kitchen dish/order views, per-device category filtering, item preparation/cancellation and a pass
  screen for dishes waiting to reach the table.
- Version-checked bills, distinct paid/empty/all-cancelled closures and owner-only closed history.
- Separate platform administration, temporary account recovery passwords and offline annual-fee records.

There are no order printers, online payments, split bills, stock management, push notifications or
offline order queues. See [product requirements](docs/product-requirements.md) for the complete boundary.

## Quick demo

With Docker and Compose v2 installed, clone the repository and run from its root in PowerShell,
macOS or Linux. Windows uses Docker Desktop with Linux containers.

```console
docker compose -f demo/compose.yaml up -d --build
```

Open <http://127.0.0.1:8080>. No `.env`, host Node/.NET SDK or Bash script is needed. The first build
downloads dependencies.

| Role                   | Username           | Password | Entry                                                   |
| ---------------------- | ------------------ | -------- | ------------------------------------------------------- |
| Owner                  | `demo.ramen.owner` | `123456` | [/staff/login](http://127.0.0.1:8080/staff/login)       |
| Staff                  | `demo.ramen.staff` | `123456` | [/staff/login](http://127.0.0.1:8080/staff/login)       |
| Platform administrator | `demo.admin`       | `123456` | [/platform/login](http://127.0.0.1:8080/platform/login) |

Demo Ramen includes eight empty tables, four categories, twelve trilingual dishes with photos and a
paid sample service period. No visits, orders or bills are preloaded. Store accounts require the first
password change. Menu ingredients/allergens and AI-generated photos are fictional demo material.

Try the flow in separate browser profiles: owner prepares a table → staff opens it → guest scans/opens
its menu and joins → guest orders → kitchen marks dishes ready → Pass marks delivery → owner confirms
offline collection → history shows the bill. A profile holds one guest visit identity at a time.

Normal restarts retain changes. To stop the demo without deleting data:

```console
docker compose -f demo/compose.yaml down
```

An explicit `down -v` resets only this demo project's volumes. The demo binds to loopback and has
separate database/key volumes; it is not the production deployment. When running native development
alongside it, use `127.0.0.1` for the demo and `localhost` for development, or separate browser profiles,
to avoid cookie collisions. Port settings, fixtures and the full walkthrough are in the
[local guide (Italian)](docs/it/local-development.md).

## Stack and layout

ASP.NET Core 10 controller API, EF Core/Npgsql and PostgreSQL 18; React 19, TypeScript, Vite,
TanStack Router/Query and shadcn/ui on Base UI. Production uses Docker Compose and Caddy on one origin.
There are eleven persistence tables; explicit row locks and conditional writes coordinate ordering,
kitchen work and closure.

| Directory   | Contents                                                           |
| ----------- | ------------------------------------------------------------------ |
| `backend/`  | API, entities, migrations and PostgreSQL integration tests         |
| `frontend/` | Guest/store/platform SPA, pure logic tests and staff PWA assets    |
| `demo/`     | Isolated local Docker experience and editable fictional fixtures   |
| `deploy/`   | Production release, migration, backup and recovery tooling         |
| `docs/`     | English requirements/contracts and the maintainer's Italian guides |

## Native development

Use the .NET SDK specified in `global.json`, Node 24 and Docker. From the repository root:

```bash
cp .env.example .env
# Edit POSTGRES_PASSWORD before starting the database.
docker compose up -d db
dotnet tool restore
dotnet user-secrets set 'ConnectionStrings:Default' \
  'Host=localhost;Port=5432;Database=tavoloflow_dev;Username=tavoloflow;Password=YOUR_LOCAL_PASSWORD' \
  --project backend/TavoloFlow.Api
dotnet ef database update --project backend/TavoloFlow.Api
```

Match the connection string to your `.env`. Compose configures the database container only; the API
does not load that file or migrate on startup. A newly migrated database has no accounts or sample data.
Use [platform bootstrap](docs/accounts-platform.md#platform-bootstrap) to start from an empty restaurant
setup, or import the fictional demo into an empty Development database:

```bash
Demo__DataPath="$PWD/demo" dotnet run --project backend/TavoloFlow.Api --launch-profile http -- --seed-demo
```

The import skips a database already containing a restaurant or platform account. Start the API:

```bash
dotnet run --project backend/TavoloFlow.Api --launch-profile http
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open <http://localhost:5173/staff/login> or `/platform/login`. Guest entrances are `/q/{token}`.
Vite proxies `/api` to `http://localhost:5093`. See the [frontend README](frontend/README.md) for frontend
configuration, and the [Italian local guide](docs/it/local-development.md) for full setup, tests and
phone access, including Windows/WSL forwarding.

## Deployment

The maintained business origin is `https://app.qiaotavoloflow.it`. The apex and `www` are reserved for
an independent Astro marketing repository on Cloudflare. This repository serves the business app/API
on the netcup VPS; it does not share parent-domain cookies or configure cross-origin access to marketing.

Build a release with `bash deploy/build-release.sh`. For another business hostname:

```bash
PUBLIC_ORIGIN=https://app.example.com bash deploy/build-release.sh
```

Use a lowercase HTTPS origin without port, path or trailing slash. The server's `DOMAIN` must match;
the installer checks the release's `public-origin.txt`. Printed QR codes keep the old URL after an
origin change and need reprinting or a redirect.

Follow the [self-hosting guide (Italian)](docs/it/self-hosting.md) for first installation, explicit
migration bundles, persistent Data Protection keys, releases, backups and restore drills. Production
never exposes API/database container ports or migrates on normal API startup. Internal readiness is
`/health/ready`, blocked by public Caddy routing. The staff [PWA guide](docs/pwa.md) covers installation
and long-open application assets.

## Validation

```bash
dotnet test TavoloFlow.slnx
cd frontend
node --test --test-isolation=none tests/*.test.ts
npm run build
npm run lint
npm run format:check
```

Integration test classes use disposable PostgreSQL containers with real migrations, separate from
development/demo data. Frontend tests use Node's built-in runner. Production release packaging has a
separate disposable-container smoke test described in the self-hosting guide.

## Documentation

- [Documentation index](docs/README.md): choose product, implementation or operational reading.
- [Product requirements](docs/product-requirements.md): roles, workflow, scope and acceptance baseline.
- [Schema](docs/er-diagram.dbml) and [ER diagram](docs/er-diagram.png).
- Implementation: [accounts/platform](docs/accounts-platform.md), [menu/tables](docs/menu-tables.md),
  [dining/ordering](docs/dining-ordering.md), [kitchen/pass](docs/kitchen-pass.md),
  [billing/history](docs/billing-history.md), [subscriptions](docs/restaurant-subscriptions.md),
  [staff PWA](docs/pwa.md).
- Personal guides in Italian: [architecture and decisions](docs/it/development-notes.md),
  [local development](docs/it/local-development.md), [self-hosting](docs/it/self-hosting.md) and
  [learning notes](docs/it/learning-notes.md).

Contribution and implementation conventions are in [AGENTS.md](AGENTS.md).
