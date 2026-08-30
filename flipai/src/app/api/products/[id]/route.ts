import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/session-guards";
import { handleApiError, jsonError } from "@/lib/api";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["draft", "active", "sold"]).optional(),
  listing: z
    .object({
      title: z.string().trim().min(1).max(120).optional(),
      description: z.string().trim().min(1).max(2000).optional(),
      strategy: z.string().max(600).optional(),
      startPrice: z.number().int().nonnegative().optional(),
      minPrice: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireApiUser();
    const userId = session.user.id;

    const product = await prisma.product.findFirst({
      where: { id: params.id, userId },
    });
    if (!product) return jsonError(404, "המוצר לא נמצא", "not_found");

    const body = patchSchema.parse(await req.json());

    if (body.status) {
      await prisma.product.update({
        where: { id: params.id },
        data: { status: body.status },
      });
      if (body.status === "active") track("product_saved", { userId, productId: params.id });
    }

    if (body.listing) {
      await prisma.generatedListing.update({
        where: { productId: params.id },
        data: body.listing,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await requireApiUser();
    const userId = session.user.id;

    const product = await prisma.product.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!product) return jsonError(404, "המוצר לא נמצא", "not_found");

    // Images are stored inline (data URIs), so deleting the product row
    // removes them via cascade — no external files to clean up.
    await prisma.product.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
