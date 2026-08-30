import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp, handleApiError, jsonError } from "@/lib/api";

const schema = z.object({
  name: z.string().trim().min(2, "שם קצר מדי").max(60),
  email: z.string().trim().toLowerCase().email("כתובת אימייל לא תקינה"),
  password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים").max(100),
});

export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    const rl = rateLimit(`signup:${ip}`, 10, 60 * 60 * 1000);
    if (!rl.ok) {
      return jsonError(429, "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.", "rate_limited");
    }

    const body = await req.json();
    const { name, email, password } = schema.parse(body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return jsonError(409, "כתובת האימייל כבר רשומה", "email_taken");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "user",
        subscription: { create: { plan: "free", status: "active" } },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
