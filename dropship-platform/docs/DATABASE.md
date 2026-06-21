# Database

The authoritative schema is [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma).
Prisma generates the migrations and the typed client. This page is a human-readable reference plus a
plain‑SQL DDL mirror for teams that want to review the raw structure.

## Conventions

- **IDs**: `cuid()` strings.
- **Money**: integer **minor units** (cents) + a `currency` string. Never floats.
- **Timestamps**: `createdAt` (default now) and `updatedAt` (auto) on mutable tables.
- **Tenancy**: every tenant‑owned table has a non‑null `tenantId` and an index on it. The
  application's `PrismaService.forTenant()` auto‑applies the filter (see ARCHITECTURE §4.3).
- **Deletes**: cascade from `Tenant` downward; child rows cascade from their parent. Orders and
  products are status‑archived rather than hard‑deleted in normal operation.

## Tables (summary)

| Table | Purpose | Key columns |
|---|---|---|
| `Tenant` | Top of the isolation tree | `slug` (unique) |
| `User` | Members of a tenant | `(tenantId,email)` unique, `role` |
| `RefreshToken` | Rotating refresh tokens (hashed) | `tokenHash` unique |
| `Store` | Sales channel binding | `channel`, `domain` |
| `Integration` | Encrypted provider credentials | `(tenantId,type,provider)` unique |
| `Supplier` | Product source | `provider`, `externalId` |
| `Product` | Catalog item | `status`, `basePriceCents`, `externalRef` |
| `ProductVariant` | Sellable SKU | `(productId,sku)` unique, `costCents` |
| `Inventory` | Per‑variant stock | `quantity`, `reserved` |
| `Category` / `Tag` | Classification | join tables `ProductCategory`/`ProductTag` |
| `StoreListing` | Product↔store with channel price | `(storeId,productId)` unique |
| `Customer` | Buyer | `(tenantId,email)` unique |
| `Order` | Order header | `(tenantId,number)` unique, `status`, totals |
| `OrderItem` | Line items w/ price+cost snapshot | `unitPriceCents`, `unitCostCents` |
| `Fulfillment` | Shipment | `carrier`, `trackingNumber`, `status` |
| `TrackingEvent` | Tracking history | `status`, `occurredAt` |
| `Payment` | Charge record | `provider`, `status`, `amountCents` |
| `AiJob` | AI agent run audit | `type`, `status`, token usage |
| `AuditLog` | Sensitive action log | `action`, `entity` |

## SQL DDL mirror (abridged)

This is generated equivalent SQL for the core tables — Prisma produces the full migration. Use
`npm run -w apps/api prisma:migrate` to apply.

```sql
CREATE TABLE "Tenant" (
  "id"        TEXT PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL
);

CREATE TABLE "User" (
  "id"           TEXT PRIMARY KEY,
  "tenantId"     TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "email"        TEXT NOT NULL,
  "passwordHash" TEXT,
  "name"         TEXT,
  "role"         TEXT NOT NULL DEFAULT 'STORE_OWNER',
  "isActive"     BOOLEAN NOT NULL DEFAULT true,
  "oauthProvider" TEXT,
  "oauthSubject"  TEXT,
  "createdAt"    TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMP NOT NULL,
  UNIQUE ("tenantId", "email")
);
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

CREATE TABLE "Product" (
  "id"             TEXT PRIMARY KEY,
  "tenantId"       TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "supplierId"     TEXT REFERENCES "Supplier"("id") ON DELETE SET NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  "status"         TEXT NOT NULL DEFAULT 'DRAFT',
  "basePriceCents" INTEGER NOT NULL DEFAULT 0,
  "currency"       TEXT NOT NULL DEFAULT 'USD',
  "imageUrls"      TEXT[] NOT NULL DEFAULT '{}',
  "externalRef"    TEXT,
  "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMP NOT NULL
);
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");
CREATE INDEX "Product_tenantId_status_idx" ON "Product"("tenantId","status");

CREATE TABLE "Order" (
  "id"            TEXT PRIMARY KEY,
  "tenantId"      TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "customerId"    TEXT REFERENCES "Customer"("id") ON DELETE SET NULL,
  "storeId"       TEXT,
  "number"        TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "currency"      TEXT NOT NULL DEFAULT 'USD',
  "subtotalCents" INTEGER NOT NULL DEFAULT 0,
  "shippingCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents"    INTEGER NOT NULL DEFAULT 0,
  "shippingAddress" JSONB,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMP NOT NULL,
  UNIQUE ("tenantId", "number")
);
CREATE INDEX "Order_tenantId_idx" ON "Order"("tenantId");
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId","status");
```

The remaining tables (`Supplier`, `ProductVariant`, `Inventory`, `StoreListing`, `OrderItem`,
`Fulfillment`, `TrackingEvent`, `Payment`, `Integration`, `AiJob`, `AuditLog`, the join tables, and
all enum types) follow the same conventions; see the Prisma schema for the exact, generated DDL.
