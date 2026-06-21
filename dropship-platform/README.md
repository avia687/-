# Dropship Platform — Multi‑Tenant Dropshipping SaaS

A production‑oriented **foundation** for a multi‑tenant dropshipping platform: marketplace/supplier
integrations behind clean adapter interfaces, multi‑store/multi‑seller tenancy, RBAC, and a
**Claude‑powered AI agent** for product content, SEO, and profitability analysis.

> **Status & honesty note.** This repository is a *real, runnable foundation*, not a finished
> billion‑dollar platform. The core domain (tenancy, auth/RBAC, products, orders, suppliers) is
> implemented and runs. Every third‑party integration (Shopify, Amazon, AliExpress, Stripe, DHL, …)
> is defined as a typed **adapter interface** with at least one concrete implementation, so the real
> integrations slot in without re‑architecting. The **AI agent is fully wired to the Anthropic API**
> and works with a real key. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for what is built vs.
> stubbed and the roadmap to fill the rest.

## What's here

| Area | Stack | State |
|------|-------|-------|
| Backend API | NestJS + TypeScript + REST + GraphQL-ready | Implemented (core) |
| Database | PostgreSQL + Prisma ORM | Full multi‑tenant schema |
| Cache / queues | Redis (BullMQ-ready) | Wired |
| Frontend | Next.js (App Router) + React + TS + Tailwind | Shell + dashboard |
| Auth | JWT access/refresh + RBAC + OAuth-ready | Implemented |
| AI agent | Anthropic Claude (`@anthropic-ai/sdk`) | Implemented (real) |
| Integrations | Marketplaces / Suppliers / Payments / Shipping | Adapter interfaces + samples |
| Infra | Docker, docker‑compose, K8s manifests, GitHub Actions | Provided |

## Quick start (local, Docker)

```bash
cd dropship-platform
cp .env.example .env            # set POSTGRES_*, JWT_*, ANTHROPIC_API_KEY
docker compose up -d postgres redis
npm install                     # installs workspaces (api + web)
npm run -w apps/api prisma:generate
npm run -w apps/api prisma:migrate
npm run -w apps/api prisma:seed
npm run -w apps/api start:dev   # API on http://localhost:4000  (Swagger at /docs)
npm run -w apps/web dev         # Web on http://localhost:3000
```

Full instructions: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — system design, ERD, folder structure, integration model, AI design, DevOps.
- [Database](docs/DATABASE.md) — schema reference and SQL DDL.
- [API](docs/API.md) — REST/GraphQL surface and OpenAPI.
- [Security](docs/SECURITY.md) — RBAC, tenancy isolation, OWASP, GDPR.
- [Deployment](docs/DEPLOYMENT.md) — local, Docker, Kubernetes, AWS.

## License

Provided as a starting foundation. Add your own license before distributing.
