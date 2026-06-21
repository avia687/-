import { SupplierProvider } from '@prisma/client';

export interface SupplierVariant {
  sku: string;
  title?: string;
  priceCents: number;
  costCents: number;
  quantity: number;
}

export interface SupplierProduct {
  externalId: string;
  title: string;
  description?: string;
  priceCents: number;
  currency: string;
  imageUrls: string[];
  variants: SupplierVariant[];
}

export interface ProductQuery {
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface InventoryLevel {
  sku: string;
  quantity: number;
}

export interface SupplierOrderRequest {
  externalProductId: string;
  sku: string;
  quantity: number;
  shippingAddress: Record<string, unknown>;
}

export interface SupplierOrderResult {
  supplierOrderId: string;
  status: string;
  trackingNumber?: string;
}

/**
 * One interface per supplier integration. The order pipeline and import flow call through
 * this contract, so swapping MANUAL for ALIEXPRESS/CJ/etc. is a new adapter, not a refactor.
 */
export interface SupplierAdapter {
  readonly provider: SupplierProvider;
  searchProducts(query: ProductQuery): Promise<SupplierProduct[]>;
  getProduct(externalId: string): Promise<SupplierProduct>;
  getInventory(externalId: string): Promise<InventoryLevel[]>;
  placeOrder(order: SupplierOrderRequest): Promise<SupplierOrderResult>;
}
