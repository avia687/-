import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/session-guards";
import { handleApiError } from "@/lib/api";
import { CATEGORIES } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  sellCategory: z.enum(CATEGORIES).optional(),
  sellFrequency: z.enum(["occasionally", "monthly", "frequently"]).optional(),
});

export async function PATCH(req: Request) {
  try {
    const session = await requireApiUser();
    const data = schema.parse(await req.json());
    await prisma.user.update({ where: { id: session.user.id }, data });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
