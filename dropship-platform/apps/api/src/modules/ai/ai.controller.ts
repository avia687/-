import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { AiService } from './ai.service';
import {
  ProductDescriptionDto,
  ProfitabilityDto,
  ResearchDto,
  SeoDto,
} from './dto/ai.dto';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STORE_OWNER, Role.MANAGER)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('product-description')
  @ApiOperation({ summary: 'Generate product marketing copy' })
  description(@Body() dto: ProductDescriptionDto) {
    return this.ai.productDescription(dto);
  }

  @Post('seo')
  @ApiOperation({ summary: 'Generate SEO title, meta, and keywords' })
  seo(@Body() dto: SeoDto) {
    return this.ai.seo(dto);
  }

  @Post('profitability')
  @ApiOperation({ summary: 'Analyze profitability and recommend a price' })
  profitability(@Body() dto: ProfitabilityDto) {
    return this.ai.profitability(dto);
  }

  @Post('research')
  @ApiOperation({ summary: 'Suggest trending product ideas for a niche' })
  research(@Body() dto: ResearchDto) {
    return this.ai.research(dto);
  }
}
