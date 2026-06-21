# Deployment

## 1. Local development

```bash
cd dropship-platform
cp .env.example .env          # fill POSTGRES_*, JWT_*, ENCRYPTION_KEY, ANTHROPIC_API_KEY
docker compose up -d postgres redis

npm install                   # workspaces: apps/api + apps/web
npm run -w apps/api prisma:generate
npm run -w apps/api prisma:migrate      # creates the schema
npm run -w apps/api prisma:seed         # demo tenant + login

npm run -w apps/api start:dev # http://localhost:4000  (Swagger /docs)
npm run -w apps/web dev       # http://localhost:3000
```

Demo login after seeding: `owner@demo.com` / `password123`.
The AI endpoints require a real `ANTHROPIC_API_KEY`; without it they return `503` and record a
FAILED `AiJob` (the rest of the app works without it).

## 2. Full stack with Docker Compose

```bash
cp .env.example .env          # set ANTHROPIC_API_KEY etc.
docker compose up --build     # postgres, redis, api (runs migrate deploy), web
```
- Web: http://localhost:3000
- API: http://localhost:4000/docs

The `api` service runs `prisma migrate deploy` on start, then boots.

## 3. Kubernetes (EKS)

Manifests in [`k8s/`](../k8s):

```bash
kubectl apply -f k8s/ingress.yaml          # namespace + ALB ingress
kubectl apply -f k8s/secrets.example.yaml  # EDIT FIRST — real values via Secrets Manager
kubectl apply -f k8s/api.yaml              # Deployment + Service + HPA
kubectl apply -f k8s/web.yaml              # Deployment + Service
```

Run migrations as a one‑off Job (or the API's init command) against RDS before/at rollout:
```bash
kubectl run migrate --rm -it --image=REGISTRY/dropship-api:latest \
  --env-from=secret/dropship-secrets -- npx prisma migrate deploy
```

## 4. AWS reference topology

```
Route53 ─▶ CloudFront ─▶ S3 (web static / standalone via ALB)
Route53 ─▶ ALB ─▶ EKS:
              ├─ dropship-api  (Deployment + HPA 2..10)
              └─ dropship-web  (Deployment 2)
EKS ─▶ RDS PostgreSQL (Multi‑AZ)
EKS ─▶ ElastiCache Redis
EKS ─▶ S3 (product media)
EKS ─▶ Secrets Manager (DB creds, JWT/ENCRYPTION keys, ANTHROPIC_API_KEY)
       Anthropic API (egress) for the AI agent
```

Recommendations:
- **RDS**: Multi‑AZ, automated backups, parameter group with `pg_stat_statements`.
- **Secrets**: External Secrets Operator syncs Secrets Manager → K8s Secrets; never bake secrets
  into images.
- **Images**: push `dropship-api` / `dropship-web` to ECR; CI builds them (see
  `.github/workflows/ci.yml`).
- **Scaling out to microservices**: the `ai` and `integrations`/`orders` workers are already
  interface‑isolated — extract them into separate Deployments and a BullMQ worker pool when traffic
  warrants, with no domain‑model rewrite.

## 5. Migrations & rollback

- Forward: `prisma migrate deploy` (idempotent, applied at API start in compose/K8s).
- New change: edit `schema.prisma`, run `prisma migrate dev --name <change>` locally, commit the
  generated migration, let CI/CD apply `migrate deploy`.
- Rollback: ship a corrective forward migration (Prisma does not auto down‑migrate in production).

## 6. Observability (next steps)

- OpenTelemetry traces from NestJS → OTLP collector.
- Prometheus metrics endpoint + Grafana dashboards (request latency, AI token spend, queue depth).
- Structured JSON logs → Loki/CloudWatch; alert on 5xx rate, auth failures, AI failure rate.
