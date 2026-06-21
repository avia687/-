import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from '../tenant/tenant-context.service';

/** Models that carry a `tenantId` column and must be tenant-scoped automatically. */
const TENANT_MODELS = new Set<string>([
  'User',
  'Store',
  'Supplier',
  'Product',
  'Category',
  'Tag',
  'Customer',
  'Order',
  'Integration',
  'AiJob',
  'AuditLog',
]);

const FILTER_OPS = new Set<string>([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

function buildTenantClient(base: PrismaClient, tenantId: string) {
  return base.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (model && TENANT_MODELS.has(model)) {
            if (FILTER_OPS.has(operation)) {
              args.where = { ...(args.where ?? {}), tenantId };
            } else if (operation === 'create') {
              args.data = { ...(args.data ?? {}), tenantId };
            } else if (operation === 'createMany') {
              const data = args.data;
              args.data = Array.isArray(data)
                ? data.map((d: Record<string, unknown>) => ({ ...d, tenantId }))
                : { ...data, tenantId };
            }
          }
          return query(args);
        },
      },
    },
  });
}

type TenantClient = ReturnType<typeof buildTenantClient>;

/**
 * PrismaService gives two access modes:
 *  - raw client (`this.prisma` itself) for system/cross-tenant operations (auth, signup).
 *  - `forTenant()` returns a client that auto-applies the current request's tenantId to every
 *    tenant-owned model. Services use this so they never hand-roll `where: { tenantId }`.
 *    For single-row tenant lookups, use findFirst (not findUnique) so the scope applies.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly cache = new Map<string, TenantClient>();

  constructor(private readonly tenantContext: TenantContextService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Tenant-scoped client for the current request (or an explicit tenantId).
   * Named `forTenant` (not `tenant`) to avoid colliding with the Prisma `Tenant` model delegate.
   */
  forTenant(tenantId?: string): TenantClient {
    const id = tenantId ?? this.tenantContext.requireTenantId();
    let client = this.cache.get(id);
    if (!client) {
      client = buildTenantClient(this, id);
      this.cache.set(id, client);
    }
    return client;
  }
}
