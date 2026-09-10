import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { assertWithinLimit } from "@/lib/subscription";

// Converts a lead into a customer: creates (or reuses) a Customer from the
// lead's contact details, links the lead, and marks it won. Idempotent — a lead
// already linked to a customer returns that customer.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("customers:write");
    const lead = await prisma.lead.findFirst({
      where: { id: params.id, organizationId: tenant.organizationId },
    });
    if (!lead) return NextResponse.json({ error: "ליד לא נמצא" }, { status: 404 });

    if (lead.customerId) {
      return NextResponse.json({ customerId: lead.customerId, alreadyLinked: true });
    }

    const count = await prisma.customer.count({ where: { organizationId: tenant.organizationId } });
    assertWithinLimit(tenant.plan, "customers", count);

    const customer = await prisma.customer.create({
      data: {
        organizationId: tenant.organizationId,
        name: lead.contactName || lead.title,
        phone: lead.contactPhone,
        notes: lead.notes,
      },
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { customerId: customer.id, status: "won" } });
    await audit(tenant, "lead.convert", "lead", lead.id);
    return NextResponse.json({ customerId: customer.id });
  } catch (err) {
    return errorResponse(err);
  }
}
