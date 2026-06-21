import { Injectable, NotFoundException } from '@nestjs/common';
import { SupplierProvider } from '@prisma/client';
import { SupplierAdapter } from './adapters/supplier-adapter.interface';
import { ManualSupplierAdapter } from './adapters/manual.adapter';
import { AliexpressSupplierAdapter } from './adapters/aliexpress.adapter';

/**
 * Resolves a SupplierProvider enum to its adapter. Domain code depends on this registry,
 * never on a concrete adapter, so providers can be added without touching callers.
 */
@Injectable()
export class SupplierRegistry {
  private readonly adapters = new Map<SupplierProvider, SupplierAdapter>();

  constructor(
    manual: ManualSupplierAdapter,
    aliexpress: AliexpressSupplierAdapter,
  ) {
    this.register(manual);
    this.register(aliexpress);
  }

  private register(adapter: SupplierAdapter): void {
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: SupplierProvider): SupplierAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new NotFoundException(`No supplier adapter registered for ${provider}`);
    }
    return adapter;
  }
}
