import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";

const updateSchema = z.object({
  amount: z.number().min(0).optional(),
  method: z.enum(["cash", "card", "transfer", "bit", "paypal", "other"]).optional(),
  status: z.enum(["paid", "pending", "partial", "overdue"]).optional(),
  dueAt: z.string().nullish(),
  notes: z.string().max(1000).nullish(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("payments:write");
    const existing = await prisma.payment.findFirst({
      where: { id: params.id, organizationId: tenant.organizationId },
    });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    const d = updateSchema.parse(await req.json());
    const payment = await prisma.payment.update({
      where: { id: params.id },
      data: {
        ...d,
        dueAt: d.dueAt === undefined ? undefined : d.dueAt ? new Date(d.dueAt) : null,
        paidAt: d.status === "paid" && existing.status !== "paid" ? new Date() : undefined,
      },
      include: { customer: true },
    });
    return NextResponse.json({ payment });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("payments:write");
    const existing = await prisma.payment.findFirst({
      where: { id: params.id, organizationId: tenant.organizationId },
    });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    await prisma.payment.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
