import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductDescriptionDto {
  @ApiProperty({ example: 'Wireless Earbuds Pro' })
  @IsString()
  productTitle!: string;

  @ApiPropertyOptional({ type: [String], example: ['Bluetooth 5.3', 'ANC', '30h battery'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ example: 'energetic, premium' })
  @IsOptional()
  @IsString()
  brandVoice?: string;

  @ApiPropertyOptional({ example: 'fitness enthusiasts aged 18-35' })
  @IsOptional()
  @IsString()
  targetAudience?: string;
}

export class SeoDto {
  @ApiProperty()
  @IsString()
  productTitle!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];
}

export class ProfitabilityDto {
  @ApiProperty({ description: 'Supplier unit cost in cents' })
  @IsInt()
  @Min(0)
  unitCostCents!: number;

  @ApiProperty({ description: 'Shipping cost in cents' })
  @IsInt()
  @Min(0)
  shippingCents!: number;

  @ApiPropertyOptional({ description: 'Marketplace/payment fee as a fraction, e.g. 0.05', example: 0.05 })
  @IsOptional()
  @IsNumber()
  feeRate?: number;

  @ApiPropertyOptional({ description: 'Target gross margin fraction, e.g. 0.4', example: 0.4 })
  @IsOptional()
  @IsNumber()
  targetMargin?: number;

  @ApiPropertyOptional({ description: 'Observed competitor price in cents' })
  @IsOptional()
  @IsInt()
  competitorPriceCents?: number;
}

export class ResearchDto {
  @ApiProperty({ example: 'eco-friendly pet products' })
  @IsString()
  niche!: string;

  @ApiPropertyOptional({ example: 'US' })
  @IsOptional()
  @IsString()
  market?: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;
}
