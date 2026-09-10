import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).nullable().optional(),
  whatsapp: z.string().max(40).nullable().optional(),
  email: z.string().email().or(z.literal("")).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.string().max(200).nullable().optional(),
});

// Ownership check: the row must belong to the caller's tenant.
async function owned(id: string, organizationId: string) {
  const row = await prisma.customer.findFirst({ where: { id, organizationId } });
  if (!row) throw Object.assign(new Error("לא נמצא"), { status: 404 });
  return row;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("customers:write");
    await owned(params.id, tenant.organizationId);
    const data = updateSchema.parse(await req.json());
    const customer = await prisma.customer.update({
      where: { id: params.id },
      data: { ...data, email: data.email === "" ? null : data.email },
    });
    return NextResponse.json({ customer });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const tenant = await requirePermission("customers:write");
    await owned(params.id, tenant.organizationId);
    await prisma.customer.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
