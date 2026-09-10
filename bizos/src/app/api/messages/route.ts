import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { getMessaging } from "@/lib/messaging";

// Sends via the configured messaging provider (mock until a real one is wired)
// and records the Message so status reflects reality — no faked "sent".
const schema = z.object({
  channel: z.enum(["whatsapp", "sms", "email"]).default("whatsapp"),
  toName: z.string().max(120).nullish(),
  toAddress: z.string().max(120).nullish(),
  template: z.string().max(60).nullish(),
  body: z.string().min(1).max(2000),
});

export async function GET() {
  try {
    const tenant = await requireTenant();
    const messages = await prisma.message.findMany({
      where: { organizationId: tenant.organizationId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ messages, connected: getMessaging().connected });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requireTenant();
    const d = schema.parse(await req.json());
    const result = await getMessaging().send({
      channel: d.channel,
      toName: d.toName ?? undefined,
      toAddress: d.toAddress ?? undefined,
      template: d.template ?? undefined,
      body: d.body,
    });
    const message = await prisma.message.create({
      data: {
        organizationId: tenant.organizationId,
        channel: d.channel,
        toName: d.toName || null,
        toAddress: d.toAddress || null,
        template: d.template || null,
        body: d.body,
        status: result.status,
      },
    });
    return NextResponse.json({ message, connected: getMessaging().connected });
  } catch (err) {
    return errorResponse(err);
  }
}
