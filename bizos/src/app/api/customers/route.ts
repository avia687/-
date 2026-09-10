import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { assertWithinLimit } from "@/lib/subscription";
import { audit } from "@/lib/audit";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional().nullable(),
  whatsapp: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  address: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  tags: z.string().max(200).optional().nullable(),
});

export async function GET(req: Request) {
  try {
    const tenant = await requirePermission("customers:read");
    const q = new URL(req.url).searchParams.get("q")?.trim();
    const customers = await prisma.customer.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }] } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ customers });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requirePermission("customers:write");
    const data = createSchema.parse(await req.json());
    const count = await prisma.customer.count({ where: { organizationId: tenant.organizationId } });
    assertWithinLimit(tenant.plan, "customers", count);

    const customer = await prisma.customer.create({
      data: { ...data, email: data.email || null, organizationId: tenant.organizationId },
    });
    await prisma.notification.create({
      data: {
        organizationId: tenant.organizationId,
        type: "new_customer",
        title: "לקוח חדש נוסף",
        body: customer.name,
        link: `/customers/${customer.id}`,
      },
    });
    await audit(tenant, "customer.create", "customer", customer.id);
    return NextResponse.json({ customer });
  } catch (err) {
    return errorResponse(err);
  }
}
