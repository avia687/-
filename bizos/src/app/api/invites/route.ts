import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { assertWithinLimit } from "@/lib/subscription";

// Owner/Admin invites a teammate. Creates a pending Employee row + an Invite
// token; the invitee accepts at /join/[token], which links them as a real user.
const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]).default("EMPLOYEE"),
  title: z.string().max(80).nullish(),
});

export async function GET() {
  try {
    const tenant = await requirePermission("employees:read");
    const invites = await prisma.invite.findMany({
      where: { organizationId: tenant.organizationId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ invites });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requirePermission("employees:write");
    const { name, email, role, title } = schema.parse(await req.json());

    const employeeCount = await prisma.employee.count({ where: { organizationId: tenant.organizationId } });
    assertWithinLimit(tenant.plan, "employees", employeeCount);

    const employee = await prisma.employee.create({
      data: { organizationId: tenant.organizationId, name, role, title: title ?? null, active: true },
    });
    const invite = await prisma.invite.create({
      data: { organizationId: tenant.organizationId, email: email.toLowerCase().trim(), role, employeeId: employee.id },
    });
    await audit(tenant, "invite.create", "invite", invite.id);
    return NextResponse.json({ invite });
  } catch (err) {
    return errorResponse(err);
  }
}
