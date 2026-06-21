import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../src/modules/ai/ai.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { TenantContextService } from '../src/common/tenant/tenant-context.service';

describe('AiService', () => {
  function build(apiKey: string) {
    const aiJob = {
      create: jest.fn().mockResolvedValue({ id: 'job1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const prisma = { forTenant: () => ({ aiJob }) } as unknown as PrismaService;
    const tenantContext = { requireTenantId: () => 'tenant-1' } as unknown as TenantContextService;
    const config = {
      get: (key: string) =>
        key === 'anthropic.apiKey' ? apiKey : key === 'anthropic.model' ? 'claude-opus-4-8' : undefined,
    } as unknown as ConfigService;
    return { service: new AiService(prisma, tenantContext, config), aiJob };
  }

  it('throws and records a FAILED job when no API key is configured', async () => {
    const { service, aiJob } = build('');

    await expect(service.productDescription({ productTitle: 'Test' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );

    expect(aiJob.create).toHaveBeenCalledTimes(1);
    expect(aiJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
  });

  it('records a RUNNING job before invoking the model', async () => {
    const { service, aiJob } = build('');
    await service.seo({ productTitle: 'Test' }).catch(() => undefined);
    expect(aiJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RUNNING', type: 'SEO' }) }),
    );
  });
});
