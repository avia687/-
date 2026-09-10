import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAI } from "@/lib/ai";
import { errorResponse } from "@/lib/api";

const schema = z.object({ description: z.string().min(2).max(200) });

// Proposes a business configuration for a custom/unknown business type.
// The client shows the proposal and only saves after the user confirms.
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!(session?.user as { id?: string } | undefined)?.id) {
      return NextResponse.json({ error: "לא מחובר" }, { status: 401 });
    }
    const { description } = schema.parse(await req.json());
    const proposal = await getAI().proposeConfig(description);
    return NextResponse.json({ proposal });
  } catch (err) {
    return errorResponse(err);
  }
}
