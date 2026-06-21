# Security

## Identity & access

- **Authentication**: JWT access tokens (short‑lived, default 15m) signed with `JWT_ACCESS_SECRET`.
  Refresh tokens (default 30d) are **rotating** and stored only as SHA‑256 hashes; using a refresh
  token revokes it and issues a new pair. OAuth (Google/Facebook) plugs in as additional Passport
  strategies that resolve to the same `User`.
- **Authorization (RBAC)**: roles `SUPER_ADMIN`, `STORE_OWNER`, `MANAGER`, `EMPLOYEE`, `CUSTOMER`.
  Routes declare `@Roles(...)`; `RolesGuard` enforces them after `JwtAuthGuard`. `SUPER_ADMIN`
  bypasses role checks (platform operators).
- **Password hashing**: argon2id.

## Tenant isolation

The highest‑value control. Every tenant‑owned model carries `tenantId`, and `PrismaService.forTenant()`
returns a client (a Prisma client extension) that **automatically injects the current tenant into
reads and filtered writes** (`findMany`, `findFirst`, `count`, `updateMany`, `deleteMany`, …).
Services never hand‑roll `where: { tenantId }` for reads, which eliminates the most common
multi‑tenant leak (a forgotten filter). Creates stamp `tenantId` from the request context explicitly.
The tenant id is bound per request from the authenticated JWT (not from a client‑supplied header on
authenticated routes).

Upgrade path: swapping to schema‑per‑tenant or DB‑per‑tenant changes only `PrismaService`'s
resolution — application code is unaffected.

## Secrets & encryption

- **In transit**: TLS everywhere (terminated at the ALB / ingress).
- **At rest**: integration credentials and other secrets are encrypted with **AES‑256‑GCM**
  (`CryptoService`) using `ENCRYPTION_KEY` (32 bytes, sourced from AWS Secrets Manager in prod).
  Ciphertext format embeds the IV and auth tag.
- Secrets are **never logged** and never returned in API responses.
- The Anthropic API key lives only on the server; the browser never sees it.

## Application hardening (OWASP)

| Risk | Control |
|---|---|
| Injection | Prisma parameterized queries; no string‑built SQL |
| Broken access control | RBAC guard + tenant‑scoped data layer |
| Security misconfiguration | Helmet headers, strict CORS allowlist, `forbidNonWhitelisted` validation |
| Mass assignment | DTOs with `class-validator` + `whitelist: true` strip unknown fields |
| Sensitive data exposure | Encryption at rest, hashed tokens, minimal error detail to clients |
| Rate limiting / DoS | `@nestjs/throttler` (per‑IP; back with Redis store in prod) |
| Auditing | `AuditLog` table for sensitive actions; `AiJob` records every AI call |

## GDPR / privacy

- **Right to access / portability**: per‑customer export endpoint (returns the customer's orders and
  PII as JSON) — add under `/customers/:id/export`.
- **Right to erasure**: per‑customer delete that anonymizes order PII while retaining
  financial records required for accounting.
- **Data minimization**: only required PII is stored; AI prompts avoid sending PII.
- **Regionality**: storage region is an infrastructure knob (RDS/S3 region); for stricter residency,
  pin per‑tenant regions in a future iteration.

## Production checklist

- [ ] Replace all default secrets; generate `ENCRYPTION_KEY` with `openssl rand -hex 32`.
- [ ] Move throttler + sessions to a Redis store.
- [ ] Enable WAF on the ALB; restrict CORS to real origins.
- [ ] Centralize logs (no secrets), add alerting on auth failures and AI error rates.
- [ ] Rotate JWT and encryption keys on a schedule; support key versioning.
- [ ] Add webhook signature verification for every marketplace/payment integration.
