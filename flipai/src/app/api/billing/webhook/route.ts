import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook (only active when Stripe is configured). Verifies the
 * signature manually (no SDK) and fulfills subscription lifecycle events.
 */
function verify(payload: string, sigHeader: string | null, secret: string) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return false;
  const signed = `${t}.${payload}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signed)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "stripe not configured" }, { status: 400 });
  }

  const payload = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!verify(payload, sig, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: {
    type: string;
    data: { object: Record<string, unknown> };
  };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  try {
    const obj = event.data.object;
    const metadata = (obj.metadata as Record<string, string>) ?? {};
    const userId = metadata.userId || (obj.client_reference_id as string);

    switch (event.type) {
      case "checkout.session.completed": {
        if (userId) {
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          await prisma.subscription.upsert({
            where: { userId },
            update: {
              plan: metadata.plan || "pro",
              status: "active",
              provider: "stripe",
              providerCustomerId: (obj.customer as string) ?? undefined,
              providerSubId: (obj.subscription as string) ?? undefined,
              periodStart: now,
              periodEnd,
              cancelAtPeriodEnd: false,
            },
            create: {
              userId,
              plan: metadata.plan || "pro",
              status: "active",
              provider: "stripe",
              providerCustomerId: (obj.customer as string) ?? undefined,
              providerSubId: (obj.subscription as string) ?? undefined,
              periodStart: now,
              periodEnd,
            },
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subId = obj.id as string;
        await prisma.subscription.updateMany({
          where: { providerSubId: subId },
          data: { plan: "free", status: "canceled", cancelAtPeriodEnd: true },
        });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
