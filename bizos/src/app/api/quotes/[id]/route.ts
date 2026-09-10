import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { dispatch } from "@/lib/automations/engine";

// Owner-side status changes (send / mark approved / reject). Item editing is
// done by recreating a quote in this MVP to keep totals authoritative.
const updateSchema = z.object({
  status: z.enum(["draft", "sent", "approved", "rejected"]).optional(),
  notes: z.string().max(2000).nullish(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("quotes:write");
    const existing = await prisma.quote.findFirst({
      where: { id: params.id, organizationId: tenant.organizationId },
    });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    const d = updateSchema.parse(await req.json());
    const quote = await prisma.quote.update({
      where: { id: params.id },
      data: {
        ...d,
        approvedAt: d.status === "approved" ? new Date() : undefined,
      },
      include: { customer: true, items: true },
    });
    await audit(tenant, "quote.update", "quote", params.id);
    if (d.status === "sent" && existing.status !== "sent") {
      await dispatch(tenant.organizationId, "quote_sent", {
        dedupeKey: `quote_sent:${quote.id}`,
        customerId: quote.customerId ?? undefined,
        customerName: quote.customer?.name,
      });
    }
    return NextResponse.json({ quote });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("quotes:write");
    const existing = await prisma.quote.findFirst({
      where: { id: params.id, organizationId: tenant.organizationId },
    });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    await prisma.quote.delete({ where: { id: params.id } });
    await audit(tenant, "quote.delete", "quote", params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
