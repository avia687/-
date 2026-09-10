import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { getAI } from "@/lib/ai";
import { buildSnapshot } from "@/lib/ai/snapshot";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const schema = z.object({ instruction: z.string().min(1).max(500) });

// Returns a DRAFT action only — it never writes to the DB. The assistant UI
// shows a preview and the user must confirm; confirmation then calls the normal
// create endpoints (which enforce their own permissions + write AuditLog).
export async function POST(req: Request) {
  try {
    const tenant = await requirePermission("ai:use");
    rateLimit(`ai:${tenant.userId}`, 20, 60_000);
    const { instruction } = schema.parse(await req.json());
    const snapshot = await buildSnapshot(tenant.organizationId);
    const action = await getAI().proposeAction(instruction, snapshot);
    // Log that a draft was proposed (not that anything was written).
    await audit(tenant, `ai.propose.${action.type}`, "ai");
    return NextResponse.json({ action });
  } catch (err) {
    return errorResponse(err);
  }
}
