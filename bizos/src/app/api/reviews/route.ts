import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";

// Owner creates a review request (generates a public token); customers submit
// via /api/public/review/[token].
const schema = z.object({ customerId: z.string().nullish() });

export async function GET() {
  try {
    const tenant = await requirePermission("reviews:read");
    const reviews = await prisma.review.findMany({
      where: { organizationId: tenant.organizationId },
      include: { customer: true },
      orderBy: { requestedAt: "desc" },
    });
    return NextResponse.json({ reviews });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requirePermission("reviews:write");
    const { customerId } = schema.parse(await req.json().catch(() => ({})));
    const review = await prisma.review.create({
      data: { organizationId: tenant.organizationId, customerId: customerId || null },
      include: { customer: true },
    });
    return NextResponse.json({ review });
  } catch (err) {
    return errorResponse(err);
  }
}
