import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";

// Public (unauthenticated) quote actions — access is gated solely by the
// unguessable publicToken. Customers open the link and approve/reject.
const schema = z.object({ action: z.enum(["approve", "reject"]) });

export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const { action } = schema.parse(await req.json());
    const quote = await prisma.quote.findUnique({ where: { publicToken: params.token } });
    if (!quote) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    if (quote.status === "approved" || quote.status === "rejected") {
      return NextResponse.json({ error: "כבר טופל" }, { status: 409 });
    }

    const status = action === "approve" ? "approved" : "rejected";
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status, approvedAt: action === "approve" ? new Date() : null },
    });

    if (action === "approve") {
      await prisma.notification.create({
        data: {
          organizationId: quote.organizationId,
          type: "quote_approved",
          title: "הצעת מחיר אושרה",
          body: `הצעה #${quote.number} בסך ${quote.total}`,
        },
      });
    }
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return errorResponse(err);
  }
}
