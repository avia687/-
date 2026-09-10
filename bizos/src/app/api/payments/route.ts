import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { audit } from "@/lib/audit";

const createSchema = z.object({
  customerId: z.string().nullish(),
  jobId: z.string().nullish(),
  amount: z.number().min(0),
  method: z.enum(["cash", "card", "transfer", "bit", "paypal", "other"]).default("cash"),
  status: z.enum(["paid", "pending", "partial", "overdue"]).default("pending"),
  dueAt: z.string().nullish(),
  notes: z.string().max(1000).nullish(),
});

export async function GET() {
  try {
    const tenant = await requirePermission("payments:read");
    const payments = await prisma.payment.findMany({
      where: { organizationId: tenant.organizationId },
      include: { customer: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ payments });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requirePermission("payments:write");
    const d = createSchema.parse(await req.json());
    const payment = await prisma.payment.create({
      data: {
        organizationId: tenant.organizationId,
        customerId: d.customerId || null,
        jobId: d.jobId || null,
        amount: d.amount,
        method: d.method,
        status: d.status,
        dueAt: d.dueAt ? new Date(d.dueAt) : null,
        paidAt: d.status === "paid" ? new Date() : null,
        notes: d.notes || null,
      },
      include: { customer: true },
    });
    if (d.status === "paid") {
      await prisma.notification.create({
        data: {
          organizationId: tenant.organizationId,
          type: "payment_received",
          title: "התקבל תשלום",
          body: `${payment.amount} ${payment.customer?.name ? `מ${payment.customer.name}` : ""}`,
          link: "/payments",
        },
      });
    }
    await audit(tenant, "payment.create", "payment", payment.id);
    return NextResponse.json({ payment });
  } catch (err) {
    return errorResponse(err);
  }
}
