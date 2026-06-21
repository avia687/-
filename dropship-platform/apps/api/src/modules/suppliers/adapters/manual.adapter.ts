import { Injectable } from '@nestjs/common';
import { SupplierProvider } from '@prisma/client';
import {
  InventoryLevel,
  ProductQuery,
  SupplierAdapter,
  SupplierOrderRequest,
  SupplierOrderResult,
  SupplierProduct,
} from './supplier-adapter.interface';

/**
 * The MANUAL adapter is fully functional and requires no external service. It lets the entire
 * import → list → order flow run end-to-end in development and tests, and serves as the reference
 * implementation other adapters mirror.
 */
@Injectable()
export class ManualSupplierAdapter implements SupplierAdapter {
  readonly provider = SupplierProvider.MANUAL;

  private readonly catalog = new Map<string, SupplierProduct>([
    [
      'demo-1',
      {
        externalId: 'demo-1',
        title: 'Wireless Earbuds Pro',
        description: 'Noise-cancelling true wireless earbuds with charging case.',
        priceCents: 2999,
        currency: 'USD',
        imageUrls: ['https://example.com/earbuds.jpg'],
        variants: [
          { sku: 'EB-PRO-BLK', title: 'Black', priceCents: 2999, costCents: 1200, quantity: 500 },
          { sku: 'EB-PRO-WHT', title: 'White', priceCents: 2999, costCents: 1200, quantity: 300 },
        ],
      },
    ],
  ]);

  async searchProducts(query: ProductQuery): Promise<SupplierProduct[]> {
    const all = [...this.catalog.values()];
    if (!query.keyword) return all;
    const k = query.keyword.toLowerCase();
    return all.filter((p) => p.title.toLowerCase().includes(k));
  }

  async getProduct(externalId: string): Promise<SupplierProduct> {
    const product = this.catalog.get(externalId);
    if (!product) {
      // Fabricate a deterministic product so imports work for any id in dev.
      return {
        externalId,
        title: `Imported product ${externalId}`,
        description: 'Imported via manual supplier adapter.',
        priceCents: 1999,
        currency: 'USD',
        imageUrls: [],
        variants: [
          { sku: `${externalId}-default`, priceCents: 1999, costCents: 800, quantity: 100 },
        ],
      };
    }
    return product;
  }

  async getInventory(externalId: string): Promise<InventoryLevel[]> {
    const product = await this.getProduct(externalId);
    return product.variants.map((v) => ({ sku: v.sku, quantity: v.quantity }));
  }

  async placeOrder(_order: SupplierOrderRequest): Promise<SupplierOrderResult> {
    return {
      supplierOrderId: `manual-${Date.now()}`,
      status: 'CONFIRMED',
      trackingNumber: undefined,
    };
  }
}
