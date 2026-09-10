import { prisma } from "@/lib/db";

// Shared integration-test helpers: a clean DB and two isolated tenants (A, B)
// plus an under-privileged member, for permission + tenant-isolation tests.

export async function resetDb() {
  // Cascades handle children; users are independent of orgs.
  await prisma.organization.deleteMany();
  await prisma.user.deleteMany();
}

export type SeededOrg = {
  orgId: string;
  ownerId: string;
  employeeUserId: string;
  customerId: string;
  serviceId: string;
};

async function seedOrg(slug: string, businessType: string): Promise<SeededOrg> {
  const owner = await prisma.user.create({ data: { email: `${slug}-owner@test`, name: "Owner" } });
  const employeeUser = await prisma.user.create({ data: { email: `${slug}-emp@test`, name: "Emp" } });

  const org = await prisma.organization.create({
    data: {
      slug,
      subscription: { create: { plan: "business" } },
      profile: { create: { businessType, name: `${slug} biz`, onboardedAt: new Date() } },
      members: {
        create: [
          { userId: owner.id, role: "OWNER" },
          { userId: employeeUser.id, role: "EMPLOYEE" },
        ],
      },
    },
  });

  const customer = await prisma.customer.create({ data: { organizationId: org.id, name: `${slug}-cust` } });
  const service = await prisma.service.create({
    data: { organizationId: org.id, name: `${slug}-svc`, price: 300 },
  });

  return { orgId: org.id, ownerId: owner.id, employeeUserId: employeeUser.id, customerId: customer.id, serviceId: service.id };
}

export async function seedTwoOrgs() {
  await resetDb();
  const a = await seedOrg("orga", "sofa_cleaning");
  const b = await seedOrg("orgb", "plumber");
  return { a, b };
}

// Mutable "current session" the next-auth mock reads (see integration tests).
export const mockAuth: { userId: string | null } = { userId: null };
export function loginAs(userId: string | null) {
  mockAuth.userId = userId;
}

/** Builds a Request for a route handler under test. */
export function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(`http://test${url}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}
