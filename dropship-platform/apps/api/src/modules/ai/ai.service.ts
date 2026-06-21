import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AiJobStatus, AiJobType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import {
  ProductDescriptionDto,
  ProfitabilityDto,
  ResearchDto,
  SeoDto,
} from './dto/ai.dto';

// --- Structured output JSON schemas (constrain Claude's response via output_config.format) ---
// Structured outputs require additionalProperties:false + required on every object.

const SEO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'metaDescription', 'keywords', 'slug'],
  properties: {
    title: { type: 'string', description: 'SEO page title, <= 60 chars' },
    metaDescription: { type: 'string', description: 'Meta description, <= 155 chars' },
    keywords: { type: 'array', items: { type: 'string' } },
    slug: { type: 'string', description: 'url-safe slug' },
  },
} as const;

const PROFITABILITY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['recommendedPriceCents', 'grossMarginPct', 'netMarginPct', 'breakdown', 'rationale'],
  properties: {
    recommendedPriceCents: { type: 'integer' },
    grossMarginPct: { type: 'number' },
    netMarginPct: { type: 'number' },
    breakdown: {
      type: 'object',
      additionalProperties: false,
      required: ['unitCostCents', 'shippingCents', 'feeCents', 'profitCents'],
      properties: {
        unitCostCents: { type: 'integer' },
        shippingCents: { type: 'integer' },
        feeCents: { type: 'integer' },
        profitCents: { type: 'integer' },
      },
    },
    rationale: { type: 'string' },
  },
} as const;

const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'rationale', 'estimatedDemand', 'suggestedPriceCents'],
        properties: {
          name: { type: 'string' },
          rationale: { type: 'string' },
          estimatedDemand: { type: 'string', enum: ['low', 'medium', 'high'] },
          suggestedPriceCents: { type: 'integer' },
        },
      },
    },
  },
} as const;

export interface SeoResult {
  title: string;
  metaDescription: string;
  keywords: string[];
  slug: string;
}

export interface ProfitabilityResult {
  recommendedPriceCents: number;
  grossMarginPct: number;
  netMarginPct: number;
  breakdown: {
    unitCostCents: number;
    shippingCents: number;
    feeCents: number;
    profitCents: number;
  };
  rationale: string;
}

export interface ResearchResult {
  ideas: {
    name: string;
    rationale: string;
    estimatedDemand: 'low' | 'medium' | 'high';
    suggestedPriceCents: number;
  }[];
}

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    config: ConfigService,
  ) {
    const apiKey = config.get<string>('anthropic.apiKey') ?? '';
    this.model = config.get<string>('anthropic.model') ?? 'claude-opus-4-8';
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  // ---------------------------------------------------------------------------
  // Public capabilities
  // ---------------------------------------------------------------------------

  /** Generate marketing copy for a product (plain text). */
  async productDescription(dto: ProductDescriptionDto): Promise<{ description: string }> {
    return this.runJob(AiJobType.PRODUCT_DESCRIPTION, dto, async () => {
      const client = this.requireClient();
      const prompt =
        `Write a compelling e-commerce product description.\n` +
        `Product: ${dto.productTitle}\n` +
        (dto.features?.length ? `Key features: ${dto.features.join(', ')}\n` : '') +
        (dto.targetAudience ? `Target audience: ${dto.targetAudience}\n` : '') +
        (dto.brandVoice ? `Brand voice: ${dto.brandVoice}\n` : '') +
        `Return 2-3 short paragraphs followed by a 4-bullet feature list. No preamble.`;

      const msg = await client.messages.create({
        model: this.model,
        max_tokens: 1500,
        system:
          'You are an expert direct-response e-commerce copywriter. Write persuasive, ' +
          'accurate copy. Never invent specifications you were not given.',
        messages: [{ role: 'user', content: prompt }],
      });

      this.assertNotRefused(msg.stop_reason);
      return {
        output: { description: this.textOf(msg) },
        model: msg.model,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      };
    });
  }

  /** Generate SEO title/meta/keywords as structured data. */
  seo(dto: SeoDto): Promise<SeoResult> {
    const prompt =
      `Generate SEO metadata for this product.\n` +
      `Product: ${dto.productTitle}\n` +
      (dto.category ? `Category: ${dto.category}\n` : '') +
      (dto.keywords?.length ? `Seed keywords: ${dto.keywords.join(', ')}\n` : '');

    return this.structured<SeoResult>({
      type: AiJobType.SEO,
      input: dto,
      system: 'You are an SEO specialist for e-commerce storefronts.',
      prompt,
      schema: SEO_SCHEMA,
      maxTokens: 1024,
      effort: 'low',
    });
  }

  /** Profitability analysis with a recommended price (structured + adaptive thinking). */
  profitability(dto: ProfitabilityDto): Promise<ProfitabilityResult> {
    const feeRate = dto.feeRate ?? 0.05;
    const targetMargin = dto.targetMargin ?? 0.4;
    const prompt =
      `Analyze dropshipping profitability and recommend a selling price (in cents).\n` +
      `Unit cost: ${dto.unitCostCents}c\n` +
      `Shipping: ${dto.shippingCents}c\n` +
      `Fee rate (marketplace+payment): ${feeRate}\n` +
      `Target gross margin: ${targetMargin}\n` +
      (dto.competitorPriceCents ? `Competitor price: ${dto.competitorPriceCents}c\n` : '') +
      `Compute fee on the selling price. Return price, gross/net margin %, a cost breakdown, ` +
      `and a one-paragraph rationale weighing the target margin against competitor pricing.`;

    return this.structured<ProfitabilityResult>({
      type: AiJobType.PROFITABILITY,
      input: dto,
      system: 'You are a pricing and unit-economics analyst for e-commerce.',
      prompt,
      schema: PROFITABILITY_SCHEMA,
      maxTokens: 4000,
      thinking: true,
      effort: 'high',
    });
  }

  /** Trending product ideas for a niche (structured + adaptive thinking). */
  research(dto: ResearchDto): Promise<ResearchResult> {
    const count = dto.count ?? 5;
    const prompt =
      `Suggest ${count} dropshipping product ideas for the niche "${dto.niche}"` +
      (dto.market ? ` in the ${dto.market} market` : '') +
      `.\nFor each: a name, a short rationale (why it can sell / trend), an estimated demand ` +
      `level, and a suggested retail price in cents. Favor products with healthy margins and ` +
      `manageable shipping. Base estimates on general market reasoning, not invented statistics.`;

    return this.structured<ResearchResult>({
      type: AiJobType.PRODUCT_RESEARCH,
      input: dto,
      system: 'You are a product research analyst specializing in dropshipping.',
      prompt,
      schema: RESEARCH_SCHEMA,
      maxTokens: 8000,
      thinking: true,
      effort: 'high',
    });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async structured<T>(opts: {
    type: AiJobType;
    input: object;
    system: string;
    prompt: string;
    schema: Record<string, unknown>;
    maxTokens: number;
    thinking?: boolean;
    effort?: Effort;
  }): Promise<T> {
    return this.runJob<T>(opts.type, opts.input, async () => {
      const client = this.requireClient();
      const msg = await client.messages.create({
        model: this.model,
        max_tokens: opts.maxTokens,
        ...(opts.thinking ? { thinking: { type: 'adaptive' as const } } : {}),
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
        output_config: {
          format: { type: 'json_schema', schema: opts.schema },
          ...(opts.effort ? { effort: opts.effort } : {}),
        },
      });

      this.assertNotRefused(msg.stop_reason);
      const output = this.parseStructured<T>(msg);
      return {
        output,
        model: msg.model,
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      };
    });
  }

  private requireClient(): Anthropic {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'AI is not configured. Set ANTHROPIC_API_KEY to enable the AI agent.',
      );
    }
    return this.client;
  }

  private assertNotRefused(stopReason: string | null): void {
    if (stopReason === 'refusal') {
      throw new ServiceUnavailableException('The AI request was declined by safety classifiers.');
    }
  }

  private textOf(msg: Anthropic.Message): string {
    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
  }

  private parseStructured<T>(msg: Anthropic.Message): T {
    const text = this.textOf(msg);
    if (!text) throw new ServiceUnavailableException('The AI returned no structured output.');
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ServiceUnavailableException('The AI returned malformed structured output.');
    }
  }

  /** Persist every AI run as an AiJob (audit, billing, analytics). */
  private async runJob<T>(
    type: AiJobType,
    input: object,
    fn: () => Promise<{ output: T; model?: string; inputTokens?: number; outputTokens?: number }>,
  ): Promise<T> {
    const db = this.prisma.forTenant();
    const job = await db.aiJob.create({
      data: {
        tenantId: this.tenantContext.requireTenantId(),
        type,
        status: AiJobStatus.RUNNING,
        input: input as Prisma.InputJsonValue,
      },
    });

    try {
      const result = await fn();
      await db.aiJob.updateMany({
        where: { id: job.id },
        data: {
          status: AiJobStatus.SUCCEEDED,
          output: result.output as Prisma.InputJsonValue,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        },
      });
      return result.output;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`AI job ${type} failed: ${message}`);
      await db.aiJob.updateMany({
        where: { id: job.id },
        data: { status: AiJobStatus.FAILED, error: message },
      });
      throw err;
    }
  }
}
