import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";

const schema = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(6).max(200),
});

export async function POST(req: Request) {
  try {
    const { name, email, password } = schema.parse(await req.json());
    const normalized = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      return NextResponse.json({ error: "כתובת האימייל כבר רשומה" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { name, email: normalized, passwordHash } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
