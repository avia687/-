import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/session-guards";
import { handleApiError } from "@/lib/api";
import { getBilling } from "@/lib/billing";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ plan: z.enum(["pro", "seller"]) });

function baseUrl() {
  return process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}

export async function POST(req: Request) {
  try {
    const session = await requireApiUser();
    const { plan } = schema.parse(await req.json());

    track("checkout_started", { userId: session.user.id, plan });

    const billing = getBilling();
    const result = await billing.createCheckout({
      userId: session.user.id,
      email: session.user.email ?? "",
      plan,
      successUrl: `${baseUrl()}/settings`,
      cancelUrl: `${baseUrl()}/pricing`,
    });

    if (result.applied) {
      track("subscription_started", { userId: session.user.id, plan, provider: billing.name });
    }

    return NextResponse.json({ url: result.url, applied: result.applied });
  } catch (err) {
    return handleApiError(err);
  }
}
