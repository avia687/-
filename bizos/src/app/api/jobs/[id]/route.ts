import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { dispatch } from "@/lib/automations/engine";

const updateSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  customerId: z.string().nullish(),
  employeeId: z.string().nullish(),
  serviceName: z.string().max(160).nullish(),
  address: z.string().max(200).nullish(),
  price: z.number().min(0).optional(),
  status: z.string().optional(),
  startAt: z.string().optional(),
  endAt: z.string().nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("jobs:write");
    const existing = await prisma.job.findFirst({
      where: { id: params.id, organizationId: tenant.organizationId },
    });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    const d = updateSchema.parse(await req.json());
    const job = await prisma.job.update({
      where: { id: params.id },
      data: {
        ...d,
        customerId: d.customerId === undefined ? undefined : d.customerId || null,
        employeeId: d.employeeId === undefined ? undefined : d.employeeId || null,
        startAt: d.startAt ? new Date(d.startAt) : undefined,
        endAt: d.endAt === undefined ? undefined : d.endAt ? new Date(d.endAt) : null,
      },
      include: { customer: true, employee: true },
    });
    await audit(tenant, "job.update", "job", params.id);
    // When a job is completed, run thank-you + review-request automations.
    if (d.status === "done" && existing.status !== "done") {
      await dispatch(tenant.organizationId, "job_completed", {
        dedupeKey: `job_completed:${job.id}`,
        customerId: job.customerId ?? undefined,
        customerName: job.customer?.name,
      });
    }
    return NextResponse.json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("jobs:write");
    const existing = await prisma.job.findFirst({
      where: { id: params.id, organizationId: tenant.organizationId },
    });
    if (!existing) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    await prisma.job.delete({ where: { id: params.id } });
    await audit(tenant, "job.delete", "job", params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
