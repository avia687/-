import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const tenant = await requireTenant();
    const notifications = await prisma.notification.findMany({
      where: { organizationId: tenant.organizationId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({ notifications });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant();
    const body = await req.json().catch(() => ({}));
    if (body.action === "read_all") {
      await prisma.notification.updateMany({
        where: { organizationId: tenant.organizationId, read: false },
        data: { read: true },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
