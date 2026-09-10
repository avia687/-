import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";

// Public review submission, gated by the review's unguessable token.
const schema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const { rating, comment } = schema.parse(await req.json());
    const review = await prisma.review.findUnique({ where: { publicToken: params.token } });
    if (!review) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
    if (review.submittedAt) return NextResponse.json({ error: "כבר נשלח" }, { status: 409 });

    await prisma.review.update({
      where: { id: review.id },
      data: { rating, comment: comment || null, submittedAt: new Date() },
    });
    await prisma.notification.create({
      data: {
        organizationId: review.organizationId,
        type: "review_new",
        title: "ביקורת חדשה",
        body: `דירוג ${rating}/5`,
        link: "/reviews",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
