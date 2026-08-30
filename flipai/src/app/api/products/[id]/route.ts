import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
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
      include: { images: true },
    });
    if (!product) return jsonError(404, "המוצר לא נמצא", "not_found");

    // Best-effort cleanup of stored image files.
    for (const img of product.images) {
      for (const url of [img.url, img.thumbUrl].filter(Boolean) as string[]) {
        if (url.startsWith("/uploads/")) {
          await fs
            .unlink(path.join(process.cwd(), "public", url))
            .catch(() => {});
        }
      }
    }

    await prisma.product.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
