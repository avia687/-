import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/session-guards";
import { handleApiError } from "@/lib/api";
import { getBilling } from "@/lib/billing";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await requireApiUser();
    const billing = getBilling();
    await billing.cancel(session.user.id);
    track("subscription_cancelled", { userId: session.user.id, provider: billing.name });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
