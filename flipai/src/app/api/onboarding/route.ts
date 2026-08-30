import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/session-guards";
import { handleApiError } from "@/lib/api";
import { CATEGORIES } from "@/lib/ai/types";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  sellCategory: z.enum(CATEGORIES),
  sellFrequency: z.enum(["occasionally", "monthly", "frequently"]),
});

export async function POST(req: Request) {
  try {
    const session = await requireApiUser();
    const { sellCategory, sellFrequency } = schema.parse(await req.json());

    await prisma.user.update({
      where: { id: session.user.id },
      data: { sellCategory, sellFrequency, onboardedAt: new Date() },
    });

    track("onboarding_completed", {
      userId: session.user.id,
      sellCategory,
      sellFrequency,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
