# miniledger

A small microservices ledger system: create users with wallets, transfer money between them, and view transaction history — built to demonstrate real distributed-systems concerns (idempotency, row-level locking, retries, service-to-service auth boundaries) rather than just CRUD.

Two independently deployable Node.js/Express services, a static demo dashboard, and a local Docker Compose stack that runs the whole thing with one command.

## Services

- **`account-service`** (port 4001) — users, wallets, balance adjustments. PostgreSQL. JWT-protected wallet lookup.
- **`transaction-service`** (port 4002) — orchestrates transfers across two wallets by calling account-service, records transaction history. MongoDB.
- **`dashboard/`** — a single static HTML file (no build step, no dependencies) that talks directly to both services from the browser: create a user, transfer between two users, view transaction history.

See `CLAUDE.md` for a detailed running log of design decisions, known gaps, and bugs found/fixed along the way. See `DEPLOYMENT.md` for a (not-yet-built) AWS ECS Fargate deployment design.

## Architecture

```
                    Dashboard (browser)
                     /              \
                    v                v
       account-service :4001   transaction-service :4002
              |         ^               |
              v         |______________/
          PostgreSQL   (internal calls: wallet lookup,          MongoDB
                        idempotent balance adjustment)
```

`transaction-service` never touches account-service's database directly — every balance change goes through account-service's own idempotent adjust endpoint, so a transfer's debit and credit are each individually safe to retry.

## Key design points

- **Idempotency**: `POST /internal/wallets/:walletId/adjust` takes an `Idempotency-Key` header; replaying the same key returns the original result instead of double-applying the change. A transfer's debit and credit legs use derived sub-keys so they can't collide with each other.
- **Row locking**: balance adjustments use `SELECT ... FOR UPDATE` inside a transaction to prevent lost updates from concurrent requests on the same wallet.
- **Retries**: transaction-service's calls to account-service retry on network errors and `5xx` with exponential backoff, but never retry a `422` (insufficient funds is a real business rejection, not a transient failure) — and retries are safe specifically because of the idempotency keys above.
- **Auth**: JWT-based, but only wired up on one route (`GET /wallets/:userId`) as a demonstration — see `CLAUDE.md` for the full gap list (this is a portfolio project, not production-hardened).

## Prerequisites

- Docker Desktop (for the one-command path)
- Node.js 20+ and npm (if running services individually)
- A MongoDB Atlas connection string (or any reachable MongoDB) for `transaction-service` — the Compose stack ships its own local `mongo` container so you don't need Atlas just to run everything locally

## Running everything (recommended)

One command spins up Postgres, MongoDB, and both services, migrates the database on first boot, and exposes both APIs on the host:

```bash
npm run docker:up
```

Then:
```bash
curl http://localhost:4001/health
curl http://localhost:4002/health
```

Both should return `{"status":"ok","service":"..."}`. Stop everything with `docker compose down` (add `-v` to also wipe the Postgres/Mongo volumes).

**First-time setup**: each service needs its own `.env` (gitignored, not committed) for local values like `JWT_SECRET`:
```bash
cp account-service/.env.example account-service/.env
cp transaction-service/.env.example transaction-service/.env
```
The Compose stack overrides `DATABASE_URL`/`MONGO_URI`/`ACCOUNT_SERVICE_URL` to point at its own containers regardless of what's in `.env`, so the defaults are fine as-is for this path.

## Running services individually (without Docker)

Useful for active development (hot reload via `nodemon`) or running against MongoDB Atlas instead of a local Mongo.

1. **Postgres**: run one locally, or via Docker:
   ```bash
   docker run --name miniledger-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=miniledger -p 5432:5432 -d postgres:16
   ```
2. **MongoDB**: a local `mongod`, or a free MongoDB Atlas M0 cluster — either works, just needs to be reachable.
3. **Configure env vars** in each service (`cp .env.example .env` then edit `DATABASE_URL`/`MONGO_URI` to point at whatever you set up above).
4. **Migrate the database**:
   ```bash
   cd account-service && npm install && npm run migrate
   ```
5. **Start both services** (separate terminals):
   ```bash
   cd account-service && npm install && npm run dev      # http://localhost:4001
   cd transaction-service && npm install && npm run dev  # http://localhost:4002
   ```

## Running the dashboard

The dashboard is a static file — no build, no install. With both services running:

- **Simplest**: open `dashboard/index.html` directly in a browser (double-click it, or `file://` path).
- **Or serve it** (avoids any `file://` quirks):
  ```bash
  cd dashboard && python -m http.server 8080
  ```
  then open `http://localhost:8080`.

Both services have CORS enabled (allow-all) specifically so the dashboard can call them cross-origin from the browser.

## Running the tests

Each service has its own Jest suite:

```bash
cd account-service && npm install && npm test
```
Runs unit tests (mocked Postgres) plus integration tests against a dedicated `DATABASE_URL_TEST` database, which is reset and re-migrated automatically before each run — set `DATABASE_URL_TEST` in `.env` to a Postgres database you're fine wiping (the default in `.env.example` is a separate `miniledger_test` database, never the dev one).

```bash
cd transaction-service && npm install && npm test
```
Runs integration tests against the real MongoDB configured via `MONGO_URI`, with `account-service` calls mocked (no real HTTP, no account-service required to be running).

## Project structure

```
miniledger/
├── docker-compose.yml       # postgres + mongo + both services, one command to run everything
├── package.json             # root — just the "docker:up" script
├── DEPLOYMENT.md            # AWS ECS Fargate deployment design (reference only, not built)
├── CLAUDE.md                # detailed decisions/bugs-found log from building this project
├── dashboard/
│   └── index.html           # static demo UI, zero dependencies
├── account-service/
│   ├── Dockerfile
│   ├── migrations/          # 001_init.sql, 002_idempotency.sql
│   ├── src/
│   │   ├── app.js           # Express app
│   │   ├── index.js         # entry point (env validation, listen)
│   │   ├── db.js            # Postgres pool
│   │   ├── middleware/auth.js
│   │   ├── repositories/accountRepo.js
│   │   ├── routes/          # users, wallets, auth
│   │   └── scripts/migrate.js
│   └── test/                # Jest global setup for the test database
└── transaction-service/
    ├── Dockerfile
    ├── src/
    │   ├── app.js, index.js, db.js
    │   ├── models/Transaction.js
    │   ├── repositories/transactionRepo.js
    │   ├── clients/accountClient.js  # calls account-service, with retry + backoff
    │   └── routes/           # transfer, transactions
```

## Known limitations

This is a portfolio/demo project, not production-hardened. Notably: only one route requires authentication (see `CLAUDE.md` for the full list), there's no compensating transaction if a transfer's credit leg fails after the debit succeeds, and there's no real signup/login flow (`POST /auth/token` is an explicit dev-only shortcut for testing the protected route). Full details, plus every bug found and fixed while building this, are in `CLAUDE.md`.
