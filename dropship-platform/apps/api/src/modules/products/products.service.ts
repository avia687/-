import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { SupplierRegistry } from '../suppliers/supplier.registry';
import {
  CreateProductDto,
  ImportProductDto,
  UpdateProductDto,
} from './dto/product.dto';

export interface ListProductsParams {
  page?: number;
  pageSize?: number;
  status?: ProductStatus;
  search?: string;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly suppliers: SupplierRegistry,
  ) {}

  async list(params: ListProductsParams) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const where: Prisma.ProductWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.search) where.title = { contains: params.search, mode: 'insensitive' };

    const db = this.prisma.forTenant();
    const [items, total] = await Promise.all([
      db.product.findMany({
        where,
        include: { variants: { include: { inventory: true } }, supplier: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.product.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const product = await this.prisma.forTenant().product.findFirst({
      where: { id },
      include: { variants: { include: { inventory: true } }, supplier: true, listings: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(dto: CreateProductDto) {
    const db = this.prisma.forTenant();
    return db.product.create({
      data: {
        tenantId: this.tenantContext.requireTenantId(),
        title: dto.title,
        description: dto.description,
        basePriceCents: dto.basePriceCents,
        currency: dto.currency ?? 'USD',
        imageUrls: dto.imageUrls ?? [],
        supplierId: dto.supplierId,
        variants: dto.variants?.length
          ? {
              create: dto.variants.map((v) => ({
                sku: v.sku,
                title: v.title,
                priceCents: v.priceCents,
                costCents: v.costCents ?? 0,
                inventory: { create: { quantity: v.quantity ?? 0 } },
              })),
            }
          : undefined,
      },
      include: { variants: { include: { inventory: true } } },
    });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.get(id); // tenant-scoped existence check
    return this.prisma.forTenant().product.updateMany({
      where: { id },
      data: dto,
    });
  }

  async archive(id: string) {
    await this.get(id);
    return this.prisma.forTenant().product.updateMany({
      where: { id },
      data: { status: ProductStatus.ARCHIVED },
    });
  }

  /** Import a product from a supplier via its adapter, then persist it. */
  async importFromSupplier(dto: ImportProductDto) {
    const db = this.prisma.forTenant();
    const supplier = await db.supplier.findFirst({ where: { id: dto.supplierId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const adapter = this.suppliers.get(supplier.provider);
    const external = await adapter.getProduct(dto.externalId);

    return db.product.create({
      data: {
        tenantId: supplier.tenantId,
        title: external.title,
        description: external.description,
        basePriceCents: external.priceCents,
        currency: external.currency,
        imageUrls: external.imageUrls,
        supplierId: supplier.id,
        externalRef: external.externalId,
        status: ProductStatus.DRAFT,
        variants: {
          create: external.variants.map((v) => ({
            sku: v.sku,
            title: v.title,
            priceCents: v.priceCents,
            costCents: v.costCents,
            inventory: { create: { quantity: v.quantity } },
          })),
        },
      },
      include: { variants: { include: { inventory: true } } },
    });
  }
}
