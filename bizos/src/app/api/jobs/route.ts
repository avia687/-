import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { assertWithinLimit } from "@/lib/subscription";

const createSchema = z.object({
  title: z.string().min(1).max(160),
  customerId: z.string().nullish(),
  employeeId: z.string().nullish(),
  serviceName: z.string().max(160).nullish(),
  address: z.string().max(200).nullish(),
  price: z.number().min(0).default(0),
  status: z.string().default("scheduled"),
  startAt: z.string(),
  endAt: z.string().nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function GET(req: Request) {
  try {
    const tenant = await requirePermission("jobs:read");
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const jobs = await prisma.job.findMany({
      where: {
        organizationId: tenant.organizationId,
        ...(from && to ? { startAt: { gte: new Date(from), lte: new Date(to) } } : {}),
      },
      include: { customer: true, employee: true },
      orderBy: { startAt: "asc" },
    });
    return NextResponse.json({ jobs });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requirePermission("jobs:write");
    const data = createSchema.parse(await req.json());

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const jobsThisMonth = await prisma.job.count({
      where: { organizationId: tenant.organizationId, createdAt: { gte: monthStart } },
    });
    assertWithinLimit(tenant.plan, "jobsPerMonth", jobsThisMonth);

    const job = await prisma.job.create({
      data: {
        organizationId: tenant.organizationId,
        title: data.title,
        customerId: data.customerId || null,
        employeeId: data.employeeId || null,
        serviceName: data.serviceName || null,
        address: data.address || null,
        price: data.price,
        status: data.status,
        startAt: new Date(data.startAt),
        endAt: data.endAt ? new Date(data.endAt) : null,
        notes: data.notes || null,
      },
      include: { customer: true, employee: true },
    });
    return NextResponse.json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}
