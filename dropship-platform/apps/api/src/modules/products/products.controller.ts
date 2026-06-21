import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductStatus, Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  ImportProductDto,
  UpdateProductDto,
} from './dto/product.dto';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products (tenant-scoped, paginated)' })
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: ProductStatus,
    @Query('search') search?: string,
  ) {
    return this.products.list({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      status,
      search,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Post()
  @Roles(Role.STORE_OWNER, Role.MANAGER)
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Post('import')
  @Roles(Role.STORE_OWNER, Role.MANAGER)
  @ApiOperation({ summary: 'Import a product from a connected supplier' })
  import(@Body() dto: ImportProductDto) {
    return this.products.importFromSupplier(dto);
  }

  @Patch(':id')
  @Roles(Role.STORE_OWNER, Role.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Patch(':id/archive')
  @Roles(Role.STORE_OWNER, Role.MANAGER)
  archive(@Param('id') id: string) {
    return this.products.archive(id);
  }
}
