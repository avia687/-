import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { getAI } from "@/lib/ai";
import { buildSnapshot } from "@/lib/ai/snapshot";

const schema = z.object({ customerMessage: z.string().min(1).max(1000) });

export async function POST(req: Request) {
  try {
    const tenant = await requirePermission("ai:use");
    const { customerMessage } = schema.parse(await req.json());
    const snapshot = await buildSnapshot(tenant.organizationId);
    const text = await getAI().customerReply({ customerMessage, snapshot });
    return NextResponse.json({ text });
  } catch (err) {
    return errorResponse(err);
  }
}
