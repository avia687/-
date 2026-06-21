import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

interface TenantStore {
  tenantId: string | null;
  userId: string | null;
}

/**
 * Per-request tenant context backed by AsyncLocalStorage. Set by TenantMiddleware /
 * the JWT strategy, read by PrismaService to scope all queries to the current tenant.
 */
@Injectable()
export class TenantContextService {
  private readonly als = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, fn: () => T): T {
    return this.als.run(store, fn);
  }

  set(store: Partial<TenantStore>): void {
    const current = this.als.getStore();
    if (current) Object.assign(current, store);
  }

  get tenantId(): string | null {
    return this.als.getStore()?.tenantId ?? null;
  }

  get userId(): string | null {
    return this.als.getStore()?.userId ?? null;
  }

  /** Throws if no tenant is bound — use in tenant-scoped services. */
  requireTenantId(): string {
    const id = this.tenantId;
    if (!id) throw new Error('No tenant bound to the current request context');
    return id;
  }
}
