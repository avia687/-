import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FulfillmentStatus, OrderStatus } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { SupplierRegistry } from '../suppliers/supplier.registry';
import { CreateOrderDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly suppliers: SupplierRegistry,
  ) {}

  async list(page = 1, pageSize = 20, status?: OrderStatus) {
    const db = this.prisma.forTenant();
    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      db.order.findMany({
        where,
        include: { items: true, fulfillments: true, payments: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: Math.min(100, pageSize),
      }),
      db.order.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(id: string) {
    const order = await this.prisma.forTenant().order.findFirst({
      where: { id },
      include: {
        items: true,
        fulfillments: { include: { events: true } },
        payments: true,
        customer: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Creates an order, snapshotting price + supplier cost for accurate profit reporting. */
  async create(dto: CreateOrderDto) {
    const tenantId = this.tenantContext.requireTenantId();
    const db = this.prisma.forTenant();

    // ProductVariant has no tenantId, so scope it through its product's tenant.
    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await db.productVariant.findMany({
      where: { id: { in: variantIds }, product: { tenantId } },
      include: { product: true },
    });
    if (variants.length !== variantIds.length) {
      throw new BadRequestException('One or more variants not found in this tenant');
    }

    const variantById = new Map(variants.map((v) => [v.id, v]));
    let subtotal = 0;
    const itemData = dto.items.map((i) => {
      const v = variantById.get(i.variantId)!;
      subtotal += v.priceCents * i.quantity;
      return {
        variantId: v.id,
        titleSnapshot: `${v.product.title}${v.title ? ` - ${v.title}` : ''}`,
        quantity: i.quantity,
        unitPriceCents: v.priceCents,
        unitCostCents: v.costCents,
      };
    });

    const shipping = dto.shippingCents ?? 0;

    return db.order.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        storeId: dto.storeId,
        number: this.orderNumber(),
        status: OrderStatus.PENDING,
        subtotalCents: subtotal,
        shippingCents: shipping,
        totalCents: subtotal + shipping,
        shippingAddress: dto.shippingAddress ?? undefined,
        items: { create: itemData },
      },
      include: { items: true },
    });
  }

  async updateStatus(id: string, status: OrderStatus) {
    await this.get(id);
    await this.prisma.forTenant().order.updateMany({ where: { id }, data: { status } });
    return this.get(id);
  }

  /**
   * Place the order with the supplier (via adapter) and open a fulfillment record.
   * Uses the first item's product supplier; a multi-supplier cart would split fulfillments.
   */
  async fulfill(id: string) {
    const tenantId = this.tenantContext.requireTenantId();
    const order = await this.get(id);
    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
      throw new BadRequestException(`Cannot fulfill an order in status ${order.status}`);
    }

    const db = this.prisma.forTenant();
    const firstItem = order.items[0];
    if (!firstItem?.variantId) throw new BadRequestException('Order has no fulfillable items');

    const variant = await db.productVariant.findFirst({
      where: { id: firstItem.variantId, product: { tenantId } },
      include: { product: { include: { supplier: true } } },
    });
    const provider = variant?.product.supplier?.provider;

    let trackingNumber: string | undefined;
    if (variant && provider) {
      const result = await this.suppliers.get(provider).placeOrder({
        externalProductId: variant.product.externalRef ?? variant.product.id,
        sku: variant.sku,
        quantity: firstItem.quantity,
        shippingAddress: (order.shippingAddress as Record<string, unknown>) ?? {},
      });
      trackingNumber = result.trackingNumber;
    }

    await db.fulfillment.create({
      data: { orderId: order.id, trackingNumber, status: FulfillmentStatus.PENDING },
    });
    await db.order.updateMany({ where: { id: order.id }, data: { status: OrderStatus.FULFILLED } });

    return this.get(order.id);
  }

  /** Realized profit in cents: revenue (subtotal) minus supplier cost of goods. */
  profit(order: { subtotalCents: number; items: { unitCostCents: number; quantity: number }[] }): number {
    const cogs = order.items.reduce((sum, i) => sum + i.unitCostCents * i.quantity, 0);
    return order.subtotalCents - cogs;
  }

  private orderNumber(): string {
    return `DS-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`;
  }
}
