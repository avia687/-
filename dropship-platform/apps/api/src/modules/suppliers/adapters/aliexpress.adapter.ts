import { Injectable, NotImplementedException } from '@nestjs/common';
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
 * AliExpress adapter — interface wired, HTTP calls pending.
 *
 * To implement: use the AliExpress Open Platform / Dropshipping API
 * (https://openservice.aliexpress.com). Inject an authenticated HTTP client constructed from the
 * tenant's encrypted Integration credentials, and map the AliExpress product/order DTOs onto the
 * SupplierProduct / SupplierOrderResult shapes below. The rest of the system already calls this
 * contract, so no other code changes when these methods are filled in.
 */
@Injectable()
export class AliexpressSupplierAdapter implements SupplierAdapter {
  readonly provider = SupplierProvider.ALIEXPRESS;

  private notImplemented(method: string): never {
    throw new NotImplementedException(
      `AliExpress adapter '${method}' not implemented. See docs in aliexpress.adapter.ts.`,
    );
  }

  searchProducts(_query: ProductQuery): Promise<SupplierProduct[]> {
    return this.notImplemented('searchProducts');
  }

  getProduct(_externalId: string): Promise<SupplierProduct> {
    return this.notImplemented('getProduct');
  }

  getInventory(_externalId: string): Promise<InventoryLevel[]> {
    return this.notImplemented('getInventory');
  }

  placeOrder(_order: SupplierOrderRequest): Promise<SupplierOrderResult> {
    return this.notImplemented('placeOrder');
  }
}
