import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Role } from '@prisma/client';
import { TenantContextService } from '../../common/tenant/tenant-context.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret')!,
    });
  }

  /** Validates the decoded token and binds the tenant to the request context. */
  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub || !payload?.tenantId) {
      throw new UnauthorizedException('Malformed token');
    }
    // Authenticated requests are scoped to the user's tenant — overrides any header.
    this.tenantContext.set({ tenantId: payload.tenantId, userId: payload.sub });
    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role,
    };
  }
}
