import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, type Permission } from "@/lib/rbac";

export type TenantContext = {
  userId: string;
  organizationId: string;
  role: string;
  plan: string;
};

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Resolves the caller's active organization. Every API route and server
 * component uses this so all queries are scoped to a single tenant — the
 * boundary that keeps one business's data invisible to another.
 */
export async function getTenant(): Promise<TenantContext | null> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;

  const membership = await prisma.organizationMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { organization: { include: { subscription: true } } },
  });
  if (!membership) return null;

  return {
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    plan: membership.organization.subscription?.plan ?? "free",
  };
}

/** Like getTenant but throws AuthError(401) when there is no tenant. */
export async function requireTenant(): Promise<TenantContext> {
  const tenant = await getTenant();
  if (!tenant) throw new AuthError(401, "לא מחובר");
  return tenant;
}

/** Throws AuthError(403) when the tenant's role lacks the permission. */
export async function requirePermission(permission: Permission): Promise<TenantContext> {
  const tenant = await requireTenant();
  if (!can(tenant.role, permission)) {
    throw new AuthError(403, "אין הרשאה לפעולה זו");
  }
  return tenant;
}

export async function isPlatformAdmin(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return Boolean(user?.isPlatformAdmin);
}
