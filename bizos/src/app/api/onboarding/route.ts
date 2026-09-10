import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { getTemplate } from "@/lib/business/templates";
import { resolveConfig } from "@/lib/business/resolve";

const schema = z.object({
  businessType: z.string().min(1),
  name: z.string().min(1).max(120),
  ownerName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  whatsapp: z.string().max(40).optional(),
  address: z.string().max(200).optional(),
  serviceAreas: z.string().max(300).optional(),
  currency: z.string().default("ILS"),
  locale: z.string().default("he"),
  // Optional AI-proposed config for a custom business type (already confirmed).
  customServices: z
    .array(z.object({ name: z.string(), category: z.string(), price: z.number(), durationMin: z.number() }))
    .optional(),
});

function slugify(name: string) {
  const base = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
  return `${base || "biz"}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "לא מחובר" }, { status: 401 });

    const input = schema.parse(await req.json());

    // Idempotent: if the user already owns an org, treat as update.
    const existing = await prisma.organizationMember.findFirst({
      where: { userId },
      include: { organization: true },
    });

    const template = getTemplate(input.businessType);
    const seedServices = input.customServices ?? template.sampleServices;

    const organizationId = await prisma.$transaction(async (tx) => {
      let orgId = existing?.organizationId;

      if (!orgId) {
        const org = await tx.organization.create({ data: { slug: slugify(input.name) } });
        orgId = org.id;
        await tx.organizationMember.create({
          data: { organizationId: orgId, userId, role: "OWNER" },
        });
        await tx.subscription.create({ data: { organizationId: orgId, plan: "free" } });
      }

      await tx.businessProfile.upsert({
        where: { organizationId: orgId },
        update: {
          businessType: input.businessType,
          name: input.name,
          ownerName: input.ownerName,
          phone: input.phone,
          whatsapp: input.whatsapp,
          address: input.address,
          serviceAreas: input.serviceAreas,
          currency: input.currency,
          locale: input.locale,
          onboardedAt: new Date(),
        },
        create: {
          organizationId: orgId,
          businessType: input.businessType,
          name: input.name,
          ownerName: input.ownerName,
          phone: input.phone,
          whatsapp: input.whatsapp,
          address: input.address,
          serviceAreas: input.serviceAreas,
          currency: input.currency,
          locale: input.locale,
          onboardedAt: new Date(),
        },
      });

      // Seed the price list from the template (only if empty).
      const count = await tx.service.count({ where: { organizationId: orgId } });
      if (count === 0 && seedServices.length) {
        await tx.service.createMany({
          data: seedServices.map((s) => ({
            organizationId: orgId!,
            name: s.name,
            category: s.category,
            price: s.price,
            durationMin: s.durationMin,
            cost: "cost" in s ? (s as { cost?: number }).cost ?? 0 : 0,
          })),
        });
      }

      return orgId;
    });

    const config = resolveConfig(
      await prisma.businessProfile.findUnique({ where: { organizationId } }),
    );
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    return errorResponse(err);
  }
}
