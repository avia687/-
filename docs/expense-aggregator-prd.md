# Personal Finance OS — Product Requirements Document (PRD)

> **Codename:** *Ledger* (working title)
> **Status:** Planning / Pre-development — **NO CODE until this plan is approved**
> **Author:** Solution Architecture
> **Last updated:** 2026-07-15
> **Primary market:** Israel 🇮🇱 (phase 1) → Global 🌍 (phase 2)

A modern SaaS web app that **automatically centralizes all of a user's monthly expenses** from every source into one beautiful, fast, AI-powered dashboard — a *personal financial operating system*. The user should barely need to type anything in.

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Product Requirements (PRD Core)](#2-product-requirements-prd-core)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [Database Design](#5-database-design)
6. [API Architecture](#6-api-architecture)
7. [UX Flow](#7-ux-flow)
8. [UI Components](#8-ui-components)
9. [Folder Structure](#9-folder-structure)
10. [Infrastructure](#10-infrastructure)
11. [Security Plan](#11-security-plan)
12. [AI Features](#12-ai-features)
13. [Development Roadmap](#13-development-roadmap)
14. [Milestone Breakdown](#14-milestone-breakdown)
15. [Future Expansion Ideas](#15-future-expansion-ideas)

---

## 1. Product Vision

### 1.1 The problem
People manage money across **10–20 disconnected surfaces**: two banks, three credit cards, PayPal, Apple/Google subscriptions, utility portals, insurance, streaming, Amazon/AliExpress, e-mail invoices, SMS receipts. There is no single, trustworthy answer to "**where did my money actually go this month, and what's coming up?**" Existing local (Israeli) tools are clunky and manual; the best global tools (Copilot Money, Monarch) don't support Israeli banks.

### 1.2 The vision
> **A personal financial operating system.** Instead of opening a dozen apps, you open *one*. Everything is imported automatically, categorized by AI, and presented in a calm, premium interface. The product answers questions in plain language, warns you before renewals and overspend, and quietly finds you money to save.

### 1.3 Experience north-star
Feels like **Linear's speed + Notion's calm + Stripe's data density + Apple Wallet's polish**. Minimal, elegant, extremely fast, keyboard-friendly, dark & light mode, delightful micro-interactions, accessible.

### 1.4 Design principles
1. **Zero-effort ingestion.** Manual entry is the exception, not the rule.
2. **Trust before features.** It touches financial data — security and correctness beat flashy features.
3. **Explainable AI.** Every categorization/insight is traceable and user-correctable.
4. **Calm software.** No dark patterns, no spam. Notifications earn their place.
5. **Speed is a feature.** Sub-second interactions everywhere.
6. **Local-first correctness.** Israeli banks, ILS, Hebrew, RTL — first-class, not bolted on.

### 1.5 Success metrics (North-star + guardrails)
| Metric | Target (12 mo) |
|---|---|
| **North-star:** % of a user's transactions imported automatically (vs. manual) | > 90% |
| Time-to-first-value (signup → first dashboard populated) | < 5 min |
| Weekly active / monthly active (stickiness) | > 55% |
| AI categorization accuracy (pre-correction) | > 92% |
| Avg. connected accounts per active user | > 4 |
| Money saved surfaced per user / month (subscriptions + insights) | ≥ ₪150 |
| D30 retention | > 40% |

---

## 2. Product Requirements (PRD Core)

### 2.1 User Personas

**P1 — "Noa", the overwhelmed professional (primary).** 32, salaried, one bank, two credit cards, ~8 subscriptions. Wants a single truth and to stop feeling anxious. Won't tolerate manual data entry. Values design and speed.

**P2 — "Dan", the optimizer.** 41, freelancer + salary, multiple cards, PayPal, Amazon, foreign currency. Loves dashboards, budgets, wants to cut waste and forecast. Power user, wants filters, exports, keyboard shortcuts.

**P3 — "Maya & Tom", the couple / household.** Shared expenses, want a joint view with per-person breakdown and shared budgets. Care about upcoming bills and cash flow.

**P4 — "Avi", the anxious saver.** 55, distrusts fintech. Needs bank-grade security messaging, read-only guarantees, and simple summaries. Would start with **manual + email import** before connecting a bank.

### 2.2 User Stories (representative; full backlog in tracker)

**Onboarding & ingestion**
- As a user, I want to connect my bank/credit card once and have transactions flow in automatically, so I never re-enter data.
- As a user, I want to forward/scan my e-mail invoices so bills I don't pay by card are still captured.
- As a user, I want to upload a bank statement (CSV/PDF/Excel) and have it parsed, so I can start even before connecting live.
- As a cautious user, I want to see clearly that access is **read-only**, so I trust the product.

**Dashboard & understanding**
- As a user, I want a single dashboard showing total spend, category breakdown, upcoming bills and cash flow, so I understand my month at a glance.
- As a user, I want to ask "how much did I spend on restaurants in the last 6 months?" and get an instant answer with a chart.
- As a user, I want month-over-month and year-over-year comparisons.

**Categorization & control**
- As a user, I want every transaction auto-categorized, and when I fix one, I want the AI to learn.
- As a user, I want to split, merge, tag, and add notes/receipts to a transaction.

**Budgets & subscriptions**
- As a user, I want monthly and per-category budgets with alerts before I overspend.
- As a user, I want all my subscriptions detected automatically with renewal dates and price-increase warnings, and a reminder before renewal.

**Reports & notifications**
- As a user, I want monthly/quarterly/annual reports exportable to PDF/Excel/CSV.
- As a user, I want alerts for large transactions, suspicious charges, and savings opportunities.

### 2.3 User Flows (high level; detailed in §7)
1. **Signup → Connect a source → Import → AI categorize → Dashboard populated.**
2. **Email/receipt ingestion:** connect Gmail/Outlook (read-only) or forward to a unique inbox → parse → dedupe against card transactions → dashboard.
3. **Correct a category → model learns → similar future transactions auto-fixed.**
4. **Detect subscription → notify before renewal → one-click "remind me" / "help me cancel".**
5. **Ask the AI assistant a question → answer + supporting chart + drill-down.**

### 2.4 Features overview

| Area | Feature |
|---|---|
| Ingestion | Bank/card sync, statement upload (CSV/PDF/XLS), email invoice scan, receipt forwarding, manual entry |
| Normalization | Merchant enrichment, currency conversion, dedup across sources |
| AI | Auto-categorize, subscription detection, forecasting, anomaly/duplicate detection, NL Q&A, monthly summaries, savings suggestions |
| Dashboard | Totals, category breakdown, cash flow, upcoming bills, subscriptions, largest expenses, charts, filters, search, calendar, comparisons |
| Budgets | Monthly + per-category budgets, alerts, progress, forecasts, recommendations |
| Subscriptions | Detection, renewal dates, price-increase & duplicate/unused detection, reminders |
| Reports | Monthly/quarterly/annual; export PDF/Excel/CSV |
| Notifications | Bills, budget alerts, large txns, renewals, suspicious charges, savings |
| Platform | Web (responsive) → PWA → native mobile; dark/light; i18n (Hebrew/RTL + English) |

### 2.5 MVP scope (what ships first)

**In MVP:**
- Auth + accounts + household (single user first; sharing behind flag).
- **Ingestion:** manual entry + statement upload (CSV/PDF/XLS) + **email invoice scan (Gmail read-only)**. One **read-only bank/credit aggregation** path for Israel (see §10 integration note).
- **AI categorization** with user correction + learning.
- **Dashboard v1:** total spend, category breakdown, cash flow, upcoming bills, largest expenses, month-over-month.
- **Subscription detection** + renewal reminders.
- **Budgets v1:** monthly + per-category with alerts.
- **NL Q&A assistant v1** over the user's own data.
- **Reports v1:** monthly PDF/CSV export.
- Notifications (email + in-app).
- Dark/light, responsive, Hebrew/RTL + English.

**Explicitly NOT in MVP (Future):**
- Native mobile apps (PWA first).
- Investments/net-worth tracking, bill-pay, "cancel subscription on your behalf".
- WhatsApp/SMS ingestion (privacy + platform complexity).
- Multi-currency advanced tax reporting.
- Team/advisor sharing beyond a single household.

### 2.6 Future features
Investments & net worth, goal-based savings automation, shared household advanced roles, WhatsApp/SMS ingestion, "concierge cancel", open API/webhooks for power users, marketplace of insights, native iOS/Android, family/kids allowances, tax-season export packs.

---

## 3. Functional Requirements

**FR-1 Ingestion**
- FR-1.1 Connect bank/credit sources via an aggregation provider (read-only) with token storage encrypted at rest.
- FR-1.2 Upload statements CSV/PDF/XLSX; auto-detect columns/format; preview before commit.
- FR-1.3 Email scan: OAuth read-only; classify invoice/receipt emails; extract amount, merchant, date, currency; parse PDF/HTML attachments.
- FR-1.4 Unique forwarding inbox (e.g. `u_ab12@in.ledger.app`) for receipts.
- FR-1.5 Manual entry (fast add, keyboard-first, recurring templates).
- FR-1.6 **Deduplication:** a card charge + its email receipt + statement line must collapse into one transaction (fuzzy match on amount ± window, date ± window, merchant similarity).

**FR-2 Normalization & enrichment**
- FR-2.1 Merchant name cleanup + logo + canonical merchant ID.
- FR-2.2 Multi-currency: store original + converted (daily FX), user's base currency.
- FR-2.3 Transaction lifecycle: pending → posted → reconciled; support refunds/reversals.

**FR-3 Categorization**
- FR-3.1 Auto-assign category (+ optional subcategory) with confidence score.
- FR-3.2 User override; overrides create/strengthen rules; model learns per-user.
- FR-3.3 Split a transaction across categories; merge duplicates; tags & notes; attach receipt image.

**FR-4 Budgets**
- FR-4.1 Monthly total budget + per-category budgets; rollover option.
- FR-4.2 Progress bars, projected end-of-month spend, alert thresholds (e.g. 80%/100%).
- FR-4.3 AI budget recommendations from history.

**FR-5 Subscriptions**
- FR-5.1 Detect recurring payments (cadence, amount, merchant); classify monthly/annual.
- FR-5.2 Show renewal dates, price changes, duplicates, unused (no engagement signal / flagged by user).
- FR-5.3 Reminders N days before renewal; "help me cancel" (link + instructions, no auto-cancel in MVP).

**FR-6 Dashboard & analytics** — see §7/§8. Filters, search, calendar, comparisons, drill-down everywhere.

**FR-7 AI assistant**
- FR-7.1 Natural-language Q&A over user data with chart + sources + drill-down.
- FR-7.2 Monthly summary generation; savings suggestions; anomaly explanations.

**FR-8 Reports & export** — monthly/quarterly/annual; PDF/Excel/CSV; scheduled email delivery.

**FR-9 Notifications** — channels: in-app, email (MVP), push (PWA/native later). Types: bills due, budget alerts, large txn, renewal, suspicious, savings. Per-type user preferences + quiet hours.

**FR-10 Accounts & sharing** — user profile, household (shared ledger with per-member attribution), roles (owner/member/viewer) — sharing behind flag post-MVP.

---

## 4. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Dashboard initial render < 1.5s (p75); API reads p95 < 300ms; NL query answer < 3s; ingestion of a statement (≤2k rows) < 20s. |
| **Scalability** | Design for 1M users. Stateless API behind horizontal autoscale; async ingestion/AI via queues; partition-friendly schema; read replicas + caching for analytics. |
| **Availability** | 99.9% target; graceful degradation (if AI down, transactions still import as "uncategorized"). |
| **Reliability** | Exactly-once ingestion semantics via idempotency keys; all external calls retried with backoff + circuit breakers; dead-letter queues. |
| **Security** | See §11. Encryption in transit + at rest, field-level encryption for tokens/PII, least privilege, audit logs. |
| **Privacy/Compliance** | GDPR + Israeli Privacy Protection Law; data export & delete; read-only financial access; data minimization; clear consent per integration. |
| **Accessibility** | WCAG 2.1 AA; full keyboard nav; screen-reader labels; reduced-motion support; color-contrast in both themes. |
| **i18n/l10n** | Hebrew (RTL) + English at launch; locale-aware number/date/currency; extensible. |
| **Observability** | Structured logs, distributed tracing, metrics, error tracking, ingestion/AI dashboards, alerting on SLOs. |
| **Maintainability** | Typed end-to-end (TypeScript), shared schema/types, contract tests, >70% coverage on core domains. |
| **Cost** | AI cost-controlled: cheap models for bulk categorization, premium models for NL Q&A/summaries; caching; per-user quotas. |

---

## 5. Database Design

**Engine:** PostgreSQL (primary). **Redis** for cache/queues/rate-limits. **Object storage** (S3-compatible) for receipts/statements/reports. Optional **pgvector** for merchant/transaction embeddings powering categorization + semantic search.

### 5.1 Core entities (logical model)

```
users
  id, email, hashed_password/null (if OAuth-only), name, locale, base_currency,
  timezone, created_at, updated_at, deleted_at

households
  id, name, owner_user_id, created_at

household_members
  household_id, user_id, role (owner|member|viewer), joined_at

accounts                         -- a connected financial source
  id, user_id, household_id/null, provider (plaid|saltedge|manual|email|upload|paypal|...),
  type (checking|savings|credit_card|loan|paypal|wallet|utility),
  institution_name, mask (last4), currency, status (active|error|disconnected),
  external_account_id, created_at

connections                      -- provider link / OAuth grant (encrypted)
  id, user_id, provider, external_item_id,
  access_token_encrypted, refresh_token_encrypted, scopes, status,
  last_synced_at, next_sync_at, error_code/null

transactions
  id, user_id, household_id/null, account_id,
  posted_at, authorized_at/null, amount_minor (bigint), currency,
  amount_base_minor, fx_rate, direction (debit|credit),
  raw_description, merchant_id/null, category_id/null, subcategory_id/null,
  category_source (ai|user|rule), category_confidence,
  status (pending|posted|reconciled|refunded),
  is_recurring bool, subscription_id/null,
  dedup_hash, source (sync|upload|email|manual|forward),
  notes, created_at, updated_at
  -- indexes: (user_id, posted_at desc), (account_id, posted_at),
  --          (user_id, category_id), unique(dedup_hash) partial

transaction_splits
  id, transaction_id, category_id, amount_minor, note

merchants
  id, canonical_name, display_name, logo_url, category_hint,
  aliases[], external_ids jsonb, embedding vector/null

categories                       -- system + user-custom
  id, user_id/null (null=system), parent_id/null, name, icon, color, is_system

category_rules                   -- learned + manual
  id, user_id, matcher jsonb (merchant/regex/mcc/amount),
  category_id, priority, source (user|ai), created_at

subscriptions
  id, user_id, merchant_id, name, amount_minor, currency, cadence (monthly|yearly|weekly|custom),
  next_renewal_at, last_charged_at, status (active|canceled|paused|unused_suspect),
  first_seen_at, price_history jsonb, detected_by (ai|user)

budgets
  id, user_id, household_id/null, period (monthly), month,
  total_limit_minor/null, rollover bool

budget_categories
  id, budget_id, category_id, limit_minor, alert_threshold_pct

goals                            -- savings goals (future-ready)
  id, user_id, name, target_minor, saved_minor, target_date, status

insights                         -- AI-generated, user-facing
  id, user_id, type (anomaly|duplicate|saving|summary|forecast),
  title, body, severity, payload jsonb, status (new|seen|dismissed|actioned),
  created_at

notifications
  id, user_id, type, title, body, channel (inapp|email|push),
  read_at/null, sent_at, dedup_key

documents                        -- receipts, statements, generated reports
  id, user_id, kind (receipt|statement|report), storage_key, mime, meta jsonb, created_at

ingestion_jobs                   -- observability of async work
  id, user_id, source, status (queued|running|done|failed),
  stats jsonb, error/null, created_at, finished_at

audit_logs
  id, actor_user_id, action, target_type, target_id, ip, user_agent, meta jsonb, created_at
```

### 5.2 Key modeling decisions
- **Money as integer minor units** (`bigint`) + ISO currency — never floats.
- **`dedup_hash`** = hash(normalized_merchant + amount_bucket + date_bucket + account) to collapse the same expense arriving from card + email + statement.
- **Categorization is versioned by source** (`ai|user|rule`) + `confidence`, so user overrides always win and are auditable.
- **`category_rules` per-user** = the "learning" mechanism without retraining a model per user (rules + embeddings hybrid; see §12).
- **Soft deletes** (`deleted_at`) + append-only `audit_logs` for financial trust.
- **Partitioning path:** `transactions` partition by `user_id` hash or `posted_at` range as volume grows; heavy analytics served from materialized views / a summary table (`monthly_category_totals`) refreshed on ingest.
- **Row-Level Security (RLS)** in Postgres so every query is scoped to the user/household even if app code has a bug.

---

## 6. API Architecture

### 6.1 Style
- **BFF pattern:** Next.js server (App Router route handlers / server actions) as the primary API for the web client; typed with **tRPC** *or* REST + OpenAPI. Recommendation: **tRPC internally** for the web app (end-to-end types, zero drift) **plus a versioned public REST API** (`/api/v1`) for future mobile/native + power users. Contracts validated with **Zod**.
- **Async workers** (ingestion, AI, FX, report generation) consume from a queue — never block request threads.

### 6.2 Representative REST surface (`/api/v1`)
```
POST   /auth/session                     login / oauth callback
GET    /me                               profile + households

GET    /accounts                         list connected sources
POST   /connections/link-token           start bank/aggregator link
POST   /connections                      complete link (exchange token)
DELETE /connections/:id                  disconnect (revoke tokens)
POST   /connections/:id/sync             trigger manual resync

POST   /ingest/upload                    upload statement (returns job id)
POST   /ingest/email/connect             gmail/outlook read-only oauth
GET    /ingest/jobs/:id                   ingestion job status

GET    /transactions                     filter/search/paginate
POST   /transactions                     manual add
PATCH  /transactions/:id                  edit / recategorize / notes
POST   /transactions/:id/split
POST   /transactions/merge

GET    /categories | POST | PATCH | DELETE
GET    /subscriptions                    detected + status
GET    /budgets | POST | PATCH
GET    /insights                         AI insights feed
POST   /insights/:id/dismiss

POST   /assistant/query                  NL Q&A (SSE stream)
GET    /reports?period=monthly&month=... (async → document)
GET    /notifications | PATCH /notifications/:id/read
```

### 6.3 Cross-cutting API concerns
- **Auth:** short-lived access token + rotating refresh; all endpoints scoped by user/household.
- **Idempotency:** `Idempotency-Key` header on all POSTs that create financial state.
- **Pagination:** cursor-based (`?cursor=&limit=`) for transactions.
- **Rate limiting:** per-user + per-IP (Redis token bucket); stricter on `/assistant` and ingestion.
- **Validation:** Zod schemas shared between client and server.
- **Streaming:** SSE for assistant answers and long ingestion progress.
- **Versioning:** `/api/v1`; additive changes only within a version.
- **Errors:** RFC 7807 problem+json; typed error codes; never leak provider internals.

### 6.4 Event-driven ingestion pipeline
```
Source (bank webhook / email push / upload)
        │
        ▼
[ Ingest API ] --enqueue--> (Redis/BullMQ or SQS)
        │
        ▼
[ Normalizer ] clean, FX-convert, dedup(dedup_hash)
        │
        ▼
[ Categorizer ] rules → embeddings → LLM fallback → confidence
        │
        ├──> [ Subscription/Anomaly/Duplicate detectors ]
        ▼
[ Persist tx + refresh materialized summaries ] --> emit events
        │
        ▼
[ Notifier / Insight generator ]  (bills, alerts, savings, summaries)
```

---

## 7. UX Flow

### 7.1 First-run (activation) flow
```
Sign up (email or Google/Apple OAuth)
  → Welcome: choose base currency + language (Hebrew/English)
  → "Add your first source" (3 tiles):
        [Connect bank/card]  [Scan email invoices]  [Upload a statement]
        (+ "I'll add manually")
  → Consent screen (READ-ONLY, what we access, encryption promise)
  → Import runs (live progress) — dashboard skeleton fills in real time
  → AI categorizes → "Here's your month" moment (first value)
  → Optional: set a monthly budget, confirm detected subscriptions
```

### 7.2 Daily/weekly loop
```
Open app → Dashboard (this month at a glance)
  → Notification/insight nudges (renewal soon, over budget, duplicate found)
  → Review "Needs attention" (low-confidence categorizations)
  → Ask assistant a question OR drill into a category
  → Correct anything → AI learns
```

### 7.3 Correction flow (learning)
```
Transaction row → click category → pick new → "Apply to similar? (12 matching)"
  → creates category_rule + strengthens embedding → future auto-fixed
```

### 7.4 Subscription flow
```
Subscriptions tab → detected list (logo, amount, cadence, next renewal)
  → flag "unused" / "duplicate" → set reminder → (future) "help me cancel" guide
```

### 7.5 Key principles
- **Progressive disclosure:** dashboard is calm; depth on drill-down.
- **Optimistic UI** for edits; instant feedback.
- **Command palette (⌘K):** jump anywhere, run actions, ask the assistant.
- **Empty states that teach**, not blank screens.

---

## 8. UI Components

### 8.1 Design system foundations
- **Tokens:** color (semantic, theme-aware light/dark), spacing scale, radius, elevation, typography (one clean grotesk/sans, tabular figures for money), motion tokens (durations/easings), z-index.
- **Primitives (via Radix + Tailwind, i.e. shadcn-style):** Button, Input, Select, Combobox, Dialog, Sheet, Popover, Tooltip, Tabs, Toast, Dropdown, Switch, Slider, Skeleton, Avatar, Badge, Command palette.
- **RTL-first:** logical properties everywhere; mirrored layouts for Hebrew.
- **Motion:** Framer Motion; respect `prefers-reduced-motion`.

### 8.2 Domain components
| Component | Purpose |
|---|---|
| `StatTile` | Total spend, income, net, savings — big number + trend + sparkline |
| `CategoryDonut` / `CategoryBar` | Category breakdown with drill-down |
| `CashFlowChart` | Income vs. spend over time (area/line) |
| `UpcomingBills` | Calendar-linked list of predicted bills |
| `SubscriptionCard` | Logo, amount, cadence, next renewal, price-change badge |
| `TransactionTable` | Virtualized, filter/search/sort, inline edit, bulk actions |
| `BudgetProgress` | Per-category progress bars + projected overage |
| `InsightCard` | AI insight (anomaly/duplicate/saving/summary) with action |
| `AssistantPanel` | ⌘K / side panel NL Q&A with streamed answer + inline chart |
| `MonthComparison` | This vs. last month / YoY, delta highlights |
| `CalendarHeatmap` | Spend intensity by day |
| `FilterBar` | Date range, account, category, amount, search |
| `ExportMenu` | PDF / Excel / CSV |
| `EmptyState`, `SkeletonLoaders`, `ThemeToggle`, `LocaleSwitcher` |

### 8.3 Chart guidance
- Consistent, accessible categorical palette; theme-aware; tabular numerals; tooltips with source drill-down; wide charts scroll within their own container; never rely on color alone (labels + patterns). *(Follow a data-viz design system for palette + legend/axis/tooltip specs.)*

---

## 9. Folder Structure

Monorepo (Turborepo + pnpm), so web + future mobile + workers share types.

```
/apps
  /web                      Next.js (App Router) — dashboard + BFF
    /app                    routes (dashboard, transactions, budgets, subs, reports, settings)
    /components             domain components (+ ui/ primitives)
    /server                 tRPC routers, server actions
    /lib                    client utils, hooks
    /styles                 tokens, tailwind
  /workers                  async consumers (ingest, categorize, fx, reports, notify)
  /mobile                   (future) Expo/React Native — reuses /packages
/packages
  /db                       Prisma/Drizzle schema, migrations, RLS policies
  /core                     domain logic (dedup, categorize rules, subscription detect)
  /ai                       LLM clients, prompts, embeddings, guardrails, cost control
  /integrations             plaid/saltedge/paypal/gmail/parsers (pluggable adapters)
  /types                    shared Zod schemas + TS types (single source of truth)
  /ui                       shared design-system components
  /config                   eslint, tsconfig, tailwind preset
/infra                      IaC (Terraform), docker, CI/CD, env templates
/docs                       PRD, ADRs, runbooks, API reference
```
- **Integration adapters** implement a common `SourceAdapter` interface → adding a new bank/provider = new adapter, no core changes.

---

## 10. Infrastructure

### 10.1 Recommended stack (with *why*)

| Layer | Choice | Why |
|---|---|---|
| **Framework** | **Next.js + React + TypeScript** | One framework for UI + BFF; App Router streaming; huge ecosystem; SSR for fast first paint; easy Vercel deploy. |
| **Language** | **TypeScript everywhere** | End-to-end type safety across web/workers/db reduces whole classes of bugs — critical for money. |
| **Styling** | **Tailwind + shadcn/Radix** | Fast, consistent, accessible primitives; theme tokens; great RTL/dark-mode story. |
| **DB** | **PostgreSQL** (managed: Supabase/Neon/RDS) | Relational integrity for financial data, RLS, JSONB flexibility, `pgvector` for embeddings, materialized views for analytics. |
| **ORM** | **Drizzle** (recommend) or Prisma | Drizzle: thin, SQL-first, great types, easy RLS & partitioning. Prisma acceptable for DX; pick one, document in ADR. |
| **Cache/Queue** | **Redis** + **BullMQ** (or SQS on AWS) | Rate limiting, sessions, and reliable async ingestion/AI jobs with retries/DLQ. |
| **Auth** | **Clerk** or **Auth.js (NextAuth)** | Clerk = fastest secure path (MFA, social, sessions, orgs) → less custom auth risk. Self-host option: Auth.js. |
| **AI** | **Claude (Anthropic) + a cheap model tier** | Claude for NL Q&A, summaries, reasoning-heavy categorization/insights; a cheaper/faster model for bulk categorization; embeddings for retrieval. Model-agnostic gateway so we can route by cost/quality. |
| **Bank/card data** | **Plaid / SaltEdge / TrueLayer (global)** + **local aggregation for Israel** | Global providers cover US/EU/Open Banking. **Israel has no Plaid** → use SaltEdge (has some IL coverage) and/or a compliant local aggregation approach; **email + statement upload is the reliable IL fallback** and is why it's in MVP. |
| **Email ingest** | **Gmail API (read-only)** + Outlook Graph | OAuth read-only scopes; scan invoices/receipts. |
| **Storage** | **S3-compatible** (S3/R2/Supabase Storage) | Receipts, statements, generated reports; signed URLs. |
| **Hosting** | **Vercel** (web) + **containers** for workers (Fly.io/Railway/ECS) | Vercel for edge/SSR; workers need long-running processes → containers. |
| **CDN/Edge/WAF** | **Cloudflare** | CDN, WAF, DDoS, bot mgmt, rate limiting at the edge. |
| **Containers/IaC** | **Docker + Terraform** | Reproducible infra; environment parity. |
| **Observability** | **Sentry + OpenTelemetry + Grafana/Datadog** | Errors, tracing, metrics, SLO alerting. |

> **Deviation from the brief:** brief listed both Supabase *and* raw Postgres/Prisma/Drizzle — I recommend **managed Postgres (Neon/Supabase) + Drizzle**, and **Clerk** to minimize custom auth surface. Redis + a real queue (BullMQ/SQS) replaces ad-hoc cron for reliable ingestion.

### 10.2 Environments
`local (docker-compose)` → `preview (per-PR)` → `staging` → `production`. Secrets in a manager (Doppler/Vault/cloud secrets), never in repo.

### 10.3 Integrations catalog (planned)

**Financial (auto-sync):** Plaid, SaltEdge, TrueLayer/Open Banking (EU/UK), Israeli banks + credit issuers (Max/Isracard/Cal) via SaltEdge/compliant aggregation, PayPal, Stripe (for the user's own income if freelancer), Apple/Google subscription receipts, Amazon/AliExpress order emails, utility portals (electricity/water/gas/municipal) via email/statement.

**Email/document:** Gmail (read-only), Outlook/Microsoft Graph, forwarding inbox, PDF/HTML/CSV/XLSX parsers, OCR for image receipts.

**Wallet/pay:** Apple Wallet passes, Google Wallet (limited API — likely via email receipts), Apple/Google Pay (surfaced through card feed).

**Ideas beyond the brief:** calendar (predict recurring bills), open-banking payment initiation (future bill-pay), currency/FX providers, price-tracking for subscription increases, bank SMS/email transaction alerts as a lightweight IL ingestion channel, "connect accountant" export, budgeting benchmarks (anonymized/aggregated), receipt scanning via mobile camera, shared household invites.

> ⚠️ **WhatsApp/SMS ingestion:** attractive but **high privacy + platform-policy risk**; SMS on web is not directly accessible. Defer to native app + explicit opt-in; treat as Future.

---

## 11. Security Plan

**Principle: this app touches money — security is the product.**

- **Read-only financial access.** We never move money in MVP. Communicated prominently.
- **Encryption:** TLS 1.2+ in transit; AES-256 at rest; **field-level encryption** for provider tokens & PII (envelope encryption via KMS). Tokens never logged.
- **Secrets management:** KMS/Vault/Doppler; short-lived credentials; rotation.
- **AuthN/AuthZ:** MFA available; OAuth (Google/Apple); short-lived JWT + rotating refresh; **Postgres RLS** + app-layer authorization; household roles.
- **Least privilege:** scoped OAuth (read-only Gmail, read-only bank); per-service DB roles.
- **Audit logs:** append-only, tamper-evident; every sensitive action recorded.
- **Rate limiting & abuse:** edge (Cloudflare) + app (Redis) limits; bot protection; anomaly detection on auth.
- **Fraud/anomaly detection:** unusual login, impossible travel, mass-export throttling.
- **Input safety:** Zod validation everywhere; SSRF/PDF-parser sandboxing; file-type + size limits; AV scan on uploads.
- **AI safety:** prompts never include another user's data; PII minimization to models; output guardrails; no financial *advice* claims (insights framed as informational); prompt-injection defenses on email/receipt content (treat ingested text as untrusted).
- **Compliance:** GDPR + Israeli Privacy Protection Law — consent per integration, data-subject export & delete, data minimization, DPA with subprocessors, retention policy.
- **Backups & recovery:** automated encrypted DB backups + PITR; tested restore runbook; RPO ≤ 15 min, RTO ≤ 1 hr targets.
- **Vuln management:** dependency scanning, SAST, secret scanning in CI; periodic pen-test before GA; responsible-disclosure policy.
- **Data isolation:** per-user/household row scoping enforced at DB (RLS) *and* app layers (defense in depth).

---

## 12. AI Features

### 12.1 Categorization (hybrid, cheap-by-default)
1. **Deterministic rules** (user `category_rules`, known merchants, MCC) — free/instant, handles the majority.
2. **Embedding similarity** (pgvector) to nearest previously-categorized transactions/merchants — cheap.
3. **LLM fallback** only for low-confidence/unknown — cheaper/faster model in bulk; batch calls; cache by normalized merchant.
4. **User correction → new rule + embedding update** → accuracy compounds per user. *No per-user fine-tuning needed.*

### 12.2 Subscription detection
Recurring-pattern analysis (merchant + amount stability + cadence) → subscription records with next-renewal prediction, price-increase detection (compare to `price_history`), duplicate detection (same service twice), "unused" heuristics.

### 12.3 Anomaly & duplicate detection
Statistical baselines per category/merchant → flag outliers ("3× your usual electricity bill"), duplicate charges (same amount+merchant within window), potential fraud → `insights` + notifications.

### 12.4 Forecasting
Predict end-of-month total and per-category spend from history + known recurring/upcoming bills; feed budgets ("projected to exceed food budget by ₪220").

### 12.5 Natural-language assistant
- Retrieval-over-your-own-data (structured query generation): NL → validated query plan → SQL/aggregation (never free-form SQL from the model against the DB; use a constrained query builder) → results → **Claude** composes answer + chart spec.
- Examples: "restaurants last 6 months", "what can I cancel", "compare this month vs last", "show unnecessary expenses".
- Streamed answers (SSE), with **source drill-down** (every number is clickable back to transactions). Guardrails: refuses out-of-scope, never fabricates numbers (numbers come from the query layer, not the model).

### 12.6 Summaries & savings
Monthly narrative summary; personalized savings suggestions (cheaper plan, duplicate subs, unused services, spending trends).

### 12.7 Cost & quality controls
Model routing by task (cheap for bulk, premium for reasoning), caching, batching, per-user token quotas, graceful fallback (if AI unavailable → transactions still import as uncategorized, assistant degrades to templated answers).

---

## 13. Development Roadmap

| Phase | Theme | Outcome |
|---|---|---|
| **Phase 0 — Foundations (Wk 1–2)** | Monorepo, CI/CD, DB schema, auth, design tokens, RLS | Skeleton app deploys; login works; empty dashboard. |
| **Phase 1 — Ingestion core (Wk 3–5)** | Manual entry + statement upload (CSV/PDF/XLSX) + dedup + normalization | Real transactions in, deduped, in a table. |
| **Phase 2 — AI categorization (Wk 5–7)** | Rules + embeddings + LLM fallback + correction/learning | Transactions auto-categorized; corrections stick. |
| **Phase 3 — Dashboard v1 (Wk 7–9)** | Stat tiles, category breakdown, cash flow, largest expenses, MoM, filters/search | The "here's your month" moment. |
| **Phase 4 — Email + one live source (Wk 9–12)** | Gmail read-only scan; one bank/card aggregation (SaltEdge) for IL; dedup across sources | Near-automatic ingestion. |
| **Phase 5 — Subscriptions + Budgets (Wk 12–14)** | Detection, renewals, reminders; monthly + category budgets + alerts | Proactive value. |
| **Phase 6 — Assistant + Reports + Notifications (Wk 14–16)** | NL Q&A, monthly PDF/CSV, notification prefs | Full MVP feature set. |
| **Phase 7 — Hardening & Beta (Wk 16–18)** | Security review, pen-test, performance, accessibility, i18n polish | Private beta launch. |
| **Phase 8+ — Post-MVP** | More integrations, PWA→native, investments/net worth, sharing, "concierge cancel" | Scale & expand. |

*(Timeline assumes a small focused team; adjust to actual capacity.)*

---

## 14. Milestone Breakdown

- **M0 – Walking skeleton** *(end Wk 2):* auth + deploy pipeline + schema + empty dashboard + RLS. **Exit:** a user can log in on staging.
- **M1 – First data in** *(Wk 5):* upload/manual ingestion + dedup + transaction table. **Exit:** upload a real statement, see clean transactions.
- **M2 – It understands money** *(Wk 7):* AI categorization + correction learning. **Exit:** >85% auto-categorized on test data; corrections persist.
- **M3 – The dashboard moment** *(Wk 9):* dashboard v1 + filters/search/comparison. **Exit:** "here's your month" is genuinely useful.
- **M4 – Nearly automatic** *(Wk 12):* Gmail scan + one live bank source + cross-source dedup. **Exit:** >80% of a real user's month imported with no manual entry.
- **M5 – Proactive** *(Wk 14):* subscriptions + budgets + alerts. **Exit:** app warns before renewal/overspend.
- **M6 – MVP complete** *(Wk 16):* assistant + reports + notifications. **Exit:** all MVP FRs pass; feature-complete.
- **M7 – Beta-ready** *(Wk 18):* security/pen-test/perf/a11y/i18n sign-off. **Exit:** private beta with real users.

Each milestone has: demo, metrics check (against §1.5), and a go/no-go.

---

## 15. Future Expansion Ideas

- **Wealth, not just spend:** investments, net-worth, assets/liabilities, retirement view.
- **Automation:** goal-based auto-savings, rules ("move ₪X to savings when under budget").
- **Concierge cancel & negotiate:** help cancel or negotiate bills (subs, insurance, cellular).
- **Household & family:** shared budgets with roles, kids' allowances, per-member analytics.
- **More ingestion:** WhatsApp/SMS (native + opt-in), more banks/countries, wallet deep integration.
- **Native mobile (iOS/Android)** with camera receipt capture, push, widgets, Face ID.
- **Open platform:** public API + webhooks; marketplace of community insights/rules.
- **Benchmarks:** anonymized, aggregated "people like you spend X on Y".
- **Tax season pack:** categorized export for accountants; VAT/expense reports for freelancers.
- **Proactive financial coach:** longitudinal, personalized guidance; scenario planning ("what if rent +10%?").
- **Bill-pay (open banking payment initiation)** once trust + compliance are established.

---

## Open Questions (to resolve before build)
1. **Israel bank connectivity:** confirm SaltEdge IL coverage vs. relying on email+statement for MVP (affects M4 scope).
2. **Auth:** Clerk (speed) vs. Auth.js (control/cost) — pick and ADR it.
3. **ORM:** Drizzle vs. Prisma — pick and ADR it.
4. **Household/sharing in MVP or strictly post-MVP?**
5. **AI model routing & budget:** confirm cost ceilings per active user.
6. **Legal:** DPA/compliance review for handling Israeli financial data before beta.

---

### Approval gate
> **This document is Phase 1 (planning) only. No application code will be written until this plan is reviewed and approved.** On approval, we begin at **M0 (walking skeleton)** and proceed milestone by milestone with demos and metric checks at each gate.
