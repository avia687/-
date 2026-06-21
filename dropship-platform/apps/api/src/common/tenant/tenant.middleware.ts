import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { TenantContextService } from './tenant-context.service';

/**
 * Opens an AsyncLocalStorage scope for every request. The tenantId is seeded from the
 * X-Tenant-Id header if present (e.g. storefront calls); the JWT strategy overrides it
 * with the authenticated user's tenant for authenticated routes.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContext: TenantContextService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const headerTenant = (req.headers['x-tenant-id'] as string) || null;
    this.tenantContext.run({ tenantId: headerTenant, userId: null }, () => next());
  }
}
