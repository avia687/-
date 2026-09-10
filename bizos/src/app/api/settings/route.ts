import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { parseJSON } from "@/lib/utils";
import { getTemplate } from "@/lib/business/templates";

// Business profile + terminology overrides + AI instructions.
const schema = z.object({
  name: z.string().min(1).max(120).optional(),
  ownerName: z.string().max(120).nullish(),
  businessType: z.string().max(60).optional(),
  phone: z.string().max(40).nullish(),
  whatsapp: z.string().max(40).nullish(),
  email: z.string().email().or(z.literal("")).nullish(),
  address: z.string().max(200).nullish(),
  serviceAreas: z.string().max(300).nullish(),
  currency: z.string().max(8).optional(),
  brandColor: z.string().max(20).optional(),
  terminologyOverrides: z.record(z.string()).optional(),
  aiInstructions: z.string().max(2000).nullish(),
});

export async function GET() {
  try {
    const tenant = await requirePermission("settings:read");
    const profile = await prisma.businessProfile.findUnique({
      where: { organizationId: tenant.organizationId },
    });
    const template = getTemplate(profile?.businessType);
    return NextResponse.json({
      profile: {
        ...profile,
        terminologyOverrides: parseJSON<Record<string, string>>(profile?.terminologyOverrides, {}),
      },
      defaultTerminology: template.terminology,
      plan: tenant.plan,
      role: tenant.role,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const tenant = await requirePermission("settings:write");
    const d = schema.parse(await req.json());
    const profile = await prisma.businessProfile.update({
      where: { organizationId: tenant.organizationId },
      data: {
        ...d,
        email: d.email === "" ? null : d.email,
        terminologyOverrides: d.terminologyOverrides
          ? JSON.stringify(d.terminologyOverrides)
          : undefined,
      },
    });
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    return errorResponse(err);
  }
}
