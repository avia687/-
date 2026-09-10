import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";

// Accepts an invite for the currently-authenticated user: creates the
// OrganizationMember with the invite's role and links the pending Employee row.
const schema = z.object({ token: z.string() });

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "יש להתחבר תחילה" }, { status: 401 });

    const { token } = schema.parse(await req.json());
    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) return NextResponse.json({ error: "הזמנה לא נמצאה" }, { status: 404 });
    if (invite.acceptedAt) return NextResponse.json({ error: "ההזמנה כבר נוצלה" }, { status: 409 });

    const existing = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: invite.organizationId, userId } },
    });

    await prisma.$transaction(async (tx) => {
      if (!existing) {
        await tx.organizationMember.create({
          data: { organizationId: invite.organizationId, userId, role: invite.role },
        });
      }
      if (invite.employeeId) {
        await tx.employee.update({ where: { id: invite.employeeId }, data: { userId } });
      }
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
