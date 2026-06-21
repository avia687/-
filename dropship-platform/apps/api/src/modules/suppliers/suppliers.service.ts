import { Injectable } from '@nestjs/common';
import { SupplierProvider } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { SupplierRegistry } from './supplier.registry';
import { ProductQuery } from './adapters/supplier-adapter.interface';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly registry: SupplierRegistry,
  ) {}

  list() {
    return this.prisma.forTenant().supplier.findMany({ orderBy: { createdAt: 'desc' } });
  }

  create(input: { name: string; provider: SupplierProvider; externalId?: string }) {
    return this.prisma.forTenant().supplier.create({
      data: { ...input, tenantId: this.tenantContext.requireTenantId() },
    });
  }

  /** Search a provider's catalog through its adapter (no DB write). */
  searchCatalog(provider: SupplierProvider, query: ProductQuery) {
    return this.registry.get(provider).searchProducts(query);
  }
}
