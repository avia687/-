import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { getAI } from "@/lib/ai";
import { buildSnapshot } from "@/lib/ai/snapshot";
import { rateLimit } from "@/lib/ratelimit";

const schema = z.object({ question: z.string().min(1).max(500), conversationId: z.string().optional() });

export async function POST(req: Request) {
  try {
    const tenant = await requirePermission("ai:use");
    rateLimit(`ai:${tenant.userId}`, 20, 60_000); // 20 AI calls/min per user
    const { question, conversationId } = schema.parse(await req.json());

    const snapshot = await buildSnapshot(tenant.organizationId);
    const reply = await getAI().ask(question, snapshot);

    // Persist the exchange.
    let convoId = conversationId;
    if (!convoId) {
      const convo = await prisma.aIConversation.create({
        data: { organizationId: tenant.organizationId, title: question.slice(0, 40) },
      });
      convoId = convo.id;
    }
    await prisma.aIMessage.createMany({
      data: [
        { conversationId: convoId, role: "user", content: question },
        { conversationId: convoId, role: "assistant", content: reply.text },
      ],
    });

    return NextResponse.json({ reply, conversationId: convoId });
  } catch (err) {
    return errorResponse(err);
  }
}
