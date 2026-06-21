# Architecture — Dropship Platform

This document is the master design for the platform. It covers system architecture, the data model
(ERD + schema), the folder structure, the integration model, the AI agent design, the API surface,
security, and DevOps/infrastructure. It is deliberately explicit about **what is implemented in this
repository today** versus **what is scaffolded as an interface for later**.

---

## 1. Goals & scope

A **multi‑tenant SaaS** that lets many sellers (tenants), each with one or more stores, run a
dropshipping business: import products from suppliers, sync inventory/prices, sell on marketplaces,
manage orders/fulfillment, and use AI to research products and generate content.

Design principles:

1. **Tenant isolation first.** Every domain row carries a `tenantId`. Isolation is enforced at the
   data‑access layer, not left to individual queries.
2. **Integrations are adapters.** Marketplaces, suppliers, payment providers, and carriers each sit
   behind a small typed interface. Adding "Shopify" or "AliExpress" means writing one adapter, not
   touching the core.
3. **The core runs without any third party.** You can create tenants, users, products, and orders
   with zero external credentials. Integrations enrich the core; they are not load‑bearing for it.
4. **AI is a first‑class module** but is a *provider behind an interface* too — today Anthropic
   Claude, swappable later.

### Implemented vs. scaffolded

| Capability | State |
|---|---|
| Multi‑tenancy + RBAC + JWT auth | **Implemented** |
| Products / variants / categories / inventory | **Implemented** |
| Orders / order items / status lifecycle | **Implemented** |
| Suppliers + supplier adapter interface + `manual` adapter | **Implemented** |
| AI agent (Claude): descriptions, SEO, profitability, product research | **Implemented (real API)** |
| Marketplace adapters (Shopify/Amazon/eBay/…); Supplier adapters (AliExpress/CJ/…); Payment (Stripe/PayPal); Shipping (DHL/UPS/…) | **Interfaces + sample/stub adapters** |
| GraphQL schema | Designed; REST is primary in code |
| OAuth (Google/Facebook) | Strategy points defined; JWT implemented |

---

## 2. System architecture

```
                         ┌───────────────────────────────────────────────┐
   Browser / Mobile ───▶ │  Next.js (App Router, React, Tailwind, shadcn) │
                         │  Storefront + Admin/Seller dashboard            │
                         └───────────────┬───────────────────────────────┘
                                         │ HTTPS (REST/GraphQL, JWT)
                                         ▼
   ┌───────────────────────────────────────────────────────────────────────────┐
   │                          NestJS API (TypeScript)                            │
   │                                                                             │
   │  HTTP layer:  Controllers · Guards (JwtAuthGuard, RolesGuard) · Pipes       │
   │  Cross‑cut:   TenantMiddleware → TenantContext (per‑request tenantId)       │
   │  Domain:      Auth · Users · Tenants · Stores · Products · Orders ·         │
   │               Suppliers · AI                                                │
   │  Integration: MarketplaceAdapter · SupplierAdapter · PaymentAdapter ·       │
   │               ShippingAdapter   (registries resolve provider → adapter)     │
   │  Infra svc:   PrismaService · Redis · (BullMQ workers) · AuditLog           │
   └───────┬───────────────────────────┬───────────────────────┬───────────────┘
           │                           │                       │
           ▼                           ▼                       ▼
   ┌───────────────┐          ┌────────────────┐       ┌───────────────────┐
   │  PostgreSQL   │          │     Redis      │       │  Anthropic Claude │
   │  (Prisma)     │          │ cache + queues │       │  (AI agent)       │
   └───────────────┘          └────────────────┘       └───────────────────┘
           ▲                                                    
           │  (object storage)                                  
   ┌───────────────┐     External: Shopify · Amazon · eBay · AliExpress · CJ ·
   │   AWS S3      │               Stripe · PayPal · DHL · UPS · FedEx · USPS
   └───────────────┘               (each via an adapter)
```

### Request lifecycle (authenticated)

1. Request arrives with `Authorization: Bearer <jwt>` and (optionally) an `X-Tenant-Id` / subdomain.
2. `TenantMiddleware` resolves the tenant and stores `tenantId` in an `AsyncLocalStorage`‑backed
   `TenantContext` for the duration of the request.
3. `JwtAuthGuard` validates the token and attaches the `User` (with `role`, `tenantId`).
4. `RolesGuard` checks `@Roles(...)` metadata against the user's role.
5. The controller calls a service; the service uses `PrismaService`, which **automatically scopes
   reads/filtered writes to the current tenant** (see §4.3). Long-running/external work is offloaded
   to Redis/BullMQ.

### Why a modular monolith (not microservices yet)

The prompt asked for microservices "as a stronger version." The pragmatic path: build a **modular
monolith** with hard module boundaries and adapter seams, deployable as one service now and
splittable later (extract `ai`, `integrations`, and `orders` workers into their own services with
no domain‑model rewrite, since they already talk through interfaces and the queue). This avoids
premature distributed‑systems complexity while keeping the seams that make extraction cheap.

---

## 3. Tenancy model

- **Shared database, shared schema, row‑level `tenantId`.** Simplest to operate at small/medium
  scale; every table that is tenant‑owned has a non‑null `tenantId` and an index on it.
- A **Tenant** owns Users, Stores, Products, Suppliers, Orders, Customers.
- A **Store** is a sales channel binding (a Shopify store, a Walmart seller account, …). Products are
  listed to stores via `StoreListing`.
- Upgrade path to stronger isolation: move to schema‑per‑tenant or DB‑per‑tenant by swapping the
  `PrismaService` tenant resolution; the application code does not change because it already calls
  through `TenantContext`.

---

## 4. Data model

### 4.1 Entities (ERD)

```
Tenant 1───* User                 (Tenant owns users; User has Role)
Tenant 1───* Store                 (sales channels / connected marketplaces)
Tenant 1───* Supplier              (product sources)
Tenant 1───* Product 1───* ProductVariant
Product *───* Category   (via ProductCategory)
Product *───* Tag        (via ProductTag)
ProductVariant 1───1 Inventory
Product *───1 Supplier             (sourced from)
Store  1───* StoreListing *───1 Product   (a product listed on a store)
Tenant 1───* Customer 1───* Order
Order  1───* OrderItem *───1 ProductVariant
Order  1───* Fulfillment 1───* TrackingEvent
Order  1───* Payment
Tenant 1───* Integration           (connected provider creds, encrypted)
Tenant 1───* AiJob                 (AI agent runs: research/content/pricing)
Tenant 1───* AuditLog
User   1───* RefreshToken
```

Cardinality notes:
- `Product.supplierId` is nullable (a product can exist before a supplier is chosen — "supplier
  switching" replaces it).
- `StoreListing` is the join that lets one product be sold on many channels with per‑channel price
  and external IDs.
- `Inventory` is per‑variant; `Product` aggregates availability from its variants.

### 4.2 Schema

The authoritative schema is [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).
A plain‑SQL DDL mirror is in [`DATABASE.md`](DATABASE.md). Highlights:

- Money is stored as integer **minor units** (`cents`) + a `currency` code — never floats.
- Enums: `Role`, `OrderStatus`, `FulfillmentStatus`, `PaymentStatus`, `ProductStatus`,
  `IntegrationType`, `AiJobType`, `AiJobStatus`.
- Soft state via status enums; hard deletes avoided for orders/products (use `ARCHIVED`).
- `Integration.credentials` is encrypted at rest (app‑level AES‑GCM, see §8).

### 4.3 Tenant‑safe data access

`PrismaService` exposes `forTenant()` which returns a client (a Prisma client extension) that
**auto‑applies the current `tenantId` to every read and filtered write** (`findMany`, `findFirst`,
`count`, `updateMany`, `deleteMany`, …) on tenant‑owned models. Services never hand‑roll
`where: { tenantId }` for reads — which removes the single most common multi‑tenant bug class
(forgetting the filter). Creates additionally stamp `tenantId` from the request context explicitly,
because Prisma's generated input *types* require it; the extension also injects it at runtime as a
belt‑and‑suspenders guard. See [`prisma.service.ts`](../apps/api/src/common/prisma/prisma.service.ts).

---

## 5. Integration model (adapters)

Each external category is one interface. A **registry** maps a provider enum → concrete adapter, so
the domain code is provider‑agnostic.

```ts
interface SupplierAdapter {
  readonly provider: SupplierProvider;          // ALIEXPRESS | CJ | ZENDROP | MANUAL | ...
  searchProducts(q: ProductQuery): Promise<SupplierProduct[]>;
  getProduct(externalId: string): Promise<SupplierProduct>;
  getInventory(externalId: string): Promise<InventoryLevel[]>;
  placeOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult>;
}

interface MarketplaceAdapter {
  readonly channel: SalesChannel;                // SHOPIFY | AMAZON | EBAY | ...
  publishListing(l: ListingInput): Promise<ExternalListing>;
  updateInventory(externalId: string, qty: number): Promise<void>;
  fetchOrders(since: Date): Promise<ExternalOrder[]>;
}

interface PaymentAdapter  { createCheckout(...) ; refund(...) ; verifyWebhook(...) }
interface ShippingAdapter { rate(...) ; track(trackingNumber): Promise<TrackingEvent[]> }
```

**Implemented today:** `SupplierAdapter` interface + a working `ManualSupplierAdapter` (lets you run
the whole flow without any external supplier). Other adapters ship as typed stubs that throw
`NotImplemented` with a clear TODO and the exact API docs link — so the wiring, DI, and tests exist
and only the HTTP calls remain.

Why this matters: it is the difference between "fake code that won't run" and "real seams." The order
pipeline calls `supplierRegistry.get(product.supplier.provider).placeOrder(...)` — that line is real;
swapping `MANUAL` for `ALIEXPRESS` is an adapter, not a refactor.

---

## 6. AI agent (Claude)

The AI module is the **first real integration** and is fully wired to the Anthropic API via the
official `@anthropic-ai/sdk`.

### Capabilities

- **Product description** generation (brand‑voice aware).
- **SEO title + meta** generation.
- **Profitability analysis** — given cost, shipping, fees, target margin → recommended price,
  margin, and a short rationale (returned as **structured JSON**).
- **Product research** — given a niche, returns candidate trending product ideas with rationale.

### Design choices (grounded in the Claude API reference)

- Model: `claude-opus-4-8` (configurable via `ANTHROPIC_MODEL`).
- **Adaptive thinking** (`thinking: { type: "adaptive" }`) for the analysis/research calls.
- **Structured outputs** via `output_config.format` (JSON schema) for profitability/research so the
  service gets typed data, not prose to parse.
- `max_tokens` sized per call; streaming reserved for long generations.
- Each run is persisted as an `AiJob` row (type, input, output, status, token usage) for audit,
  billing, and analytics — never trust an external call without a record.
- Tenant‑scoped + rate‑limited; the API key is server‑side only and never reaches the browser.

See [`ai.service.ts`](../apps/api/src/modules/ai/ai.service.ts).

### Roadmap (agentic)

The single‑call design upgrades cleanly to **tool use** (give Claude `search_products`,
`get_competitor_prices`, `save_draft` tools and run the agentic loop) when product research needs to
act, not just suggest. The service is structured so that becomes an additive change.

---

## 7. API surface

- **REST** is primary, documented with **OpenAPI/Swagger** (served at `/docs`, generated by
  `@nestjs/swagger` from decorators). See [`API.md`](API.md).
- **GraphQL** schema is designed in [`API.md`](API.md) and the codebase is `@nestjs/graphql`‑ready
  (code‑first); REST endpoints are the implemented surface.

Representative endpoints:

```
POST   /auth/register            create tenant + owner
POST   /auth/login               → { accessToken, refreshToken }
POST   /auth/refresh
GET    /products                 (tenant‑scoped, paginated, filterable)
POST   /products
POST   /products/import          import from a supplier adapter
GET    /orders
POST   /orders/:id/fulfill
POST   /ai/product-description   → generated copy
POST   /ai/seo                   → { title, metaDescription, keywords }
POST   /ai/profitability         → structured analysis
POST   /ai/research              → trending product ideas
GET    /health
```

---

## 8. Security

Details in [`SECURITY.md`](SECURITY.md). Summary:

- **RBAC** with roles `SUPER_ADMIN`, `STORE_OWNER`, `MANAGER`, `EMPLOYEE`, `CUSTOMER`; enforced by a
  `RolesGuard`.
- **JWT** access (short‑lived) + refresh (rotating, stored hashed). OAuth (Google/Facebook) slots in
  as additional Passport strategies.
- **Tenant isolation** at the data layer (§4.3) — defense against cross‑tenant data leaks.
- **Encryption**: secrets (`Integration.credentials`, refresh tokens) encrypted with AES‑256‑GCM
  using a key from secrets manager; TLS in transit; bcrypt/argon2 for passwords.
- **Rate limiting** via `@nestjs/throttler` (Redis store).
- **Audit logs** for sensitive actions.
- **OWASP**: input validation (`class-validator`), output encoding, parameterized queries (Prisma),
  Helmet headers, CORS allowlist, secrets never logged.
- **GDPR**: data export + erasure endpoints (per‑customer), data minimization, regional storage knob.

---

## 9. DevOps & infrastructure

- **Docker**: multi‑stage `Dockerfile` per app; `docker-compose.yml` for local (api, web, postgres,
  redis).
- **Kubernetes**: manifests in [`k8s/`](../k8s) (Deployments, Services, Ingress, HPA,
  Secrets/ConfigMap) — a starting point for EKS.
- **CI/CD**: GitHub Actions in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) —
  lint, typecheck, test, build, docker build.
- **AWS target**: EKS (workloads), RDS PostgreSQL, ElastiCache Redis, S3 (media), Secrets Manager,
  CloudFront (web), ALB ingress. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for the topology and the
  scale‑out path to microservices.

---

## 10. Folder structure

```
dropship-platform/
├── README.md
├── docker-compose.yml
├── .env.example
├── package.json                 # npm workspaces root
├── docs/
│   ├── ARCHITECTURE.md  DATABASE.md  API.md  SECURITY.md  DEPLOYMENT.md
├── apps/
│   ├── api/                      # NestJS backend
│   │   ├── prisma/schema.prisma  prisma/seed.ts
│   │   ├── src/
│   │   │   ├── main.ts  app.module.ts
│   │   │   ├── common/            # prisma, config, tenant, rbac, decorators, filters
│   │   │   └── modules/           # auth users tenants stores products orders suppliers ai
│   │   ├── test/                  # unit/integration tests
│   │   └── Dockerfile
│   └── web/                       # Next.js frontend
│       ├── src/app/               # App Router pages
│       └── Dockerfile
├── k8s/                          # Kubernetes manifests
└── .github/workflows/ci.yml
```

---

## 11. Roadmap to "enterprise"

1. Fill the marketplace/supplier/payment/shipping adapters with real API clients (one PR each).
2. Move long‑running sync/fulfillment to BullMQ workers; add idempotency keys.
3. Extract `ai` and `integrations` into separate deployables (already interface‑isolated).
4. Add observability: OpenTelemetry traces, Prometheus metrics, structured logs → Loki.
5. Add the GraphQL gateway and subscriptions for real‑time inventory.
6. SOC2 controls: full audit trail, access reviews, secret rotation automation.
