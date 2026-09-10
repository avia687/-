import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { getAI } from "@/lib/ai";
import { buildSnapshot } from "@/lib/ai/snapshot";

const schema = z.object({
  channel: z.enum(["whatsapp", "sms", "email", "instagram", "facebook", "flyer"]),
  topic: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    const tenant = await requirePermission("marketing:read");
    const { channel, topic } = schema.parse(await req.json());
    const snapshot = await buildSnapshot(tenant.organizationId);
    const text = await getAI().marketing({ channel, topic, snapshot });
    return NextResponse.json({ text });
  } catch (err) {
    return errorResponse(err);
  }
}
