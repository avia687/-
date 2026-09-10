import { prisma } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant";

/**
 * Records a business action in the AuditLog. Called from every write route and
 * from AI-driven actions so sensitive changes are traceable per §34.18/34.24.
 * Best-effort: an audit failure never breaks the underlying operation.
 */
export async function audit(
  tenant: Pick<TenantContext, "organizationId" | "userId">,
  action: string,
  entity?: string,
  entityId?: string,
) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: tenant.organizationId,
        actorUserId: tenant.userId,
        action,
        entity: entity ?? null,
        entityId: entityId ?? null,
      },
    });
  } catch {
    // swallow — auditing must not affect the request outcome
  }
}
