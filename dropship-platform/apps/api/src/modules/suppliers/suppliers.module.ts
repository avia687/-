import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { SupplierRegistry } from './supplier.registry';
import { ManualSupplierAdapter } from './adapters/manual.adapter';
import { AliexpressSupplierAdapter } from './adapters/aliexpress.adapter';

@Module({
  controllers: [SuppliersController],
  providers: [
    SuppliersService,
    SupplierRegistry,
    ManualSupplierAdapter,
    AliexpressSupplierAdapter,
  ],
  exports: [SupplierRegistry, SuppliersService],
})
export class SuppliersModule {}
