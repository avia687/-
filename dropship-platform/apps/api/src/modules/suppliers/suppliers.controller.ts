import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Role, SupplierProvider } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { SuppliersService } from './suppliers.service';

class CreateSupplierDto {
  @IsString()
  name!: string;

  @IsEnum(SupplierProvider)
  provider!: SupplierProvider;

  @IsOptional()
  @IsString()
  externalId?: string;
}

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list() {
    return this.suppliers.list();
  }

  @Post()
  @Roles(Role.STORE_OWNER, Role.MANAGER)
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Get('catalog')
  searchCatalog(
    @Query('provider') provider: SupplierProvider,
    @Query('keyword') keyword?: string,
  ) {
    return this.suppliers.searchCatalog(provider, { keyword });
  }
}
