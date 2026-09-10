import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requirePermission } from "@/lib/tenant";
import { calcQuote } from "@/lib/quote";

const itemSchema = z.object({
  serviceId: z.string().nullish(),
  name: z.string().min(1).max(160),
  quantity: z.number().min(0).default(1),
  unitPrice: z.number().min(0).default(0),
});

const createSchema = z.object({
  customerId: z.string().nullish(),
  discount: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(1).default(0.17),
  taxIncluded: z.boolean().default(false),
  notes: z.string().max(2000).nullish(),
  status: z.enum(["draft", "sent"]).default("draft"),
  items: z.array(itemSchema).min(1),
});

export async function GET() {
  try {
    const tenant = await requirePermission("quotes:read");
    const quotes = await prisma.quote.findMany({
      where: { organizationId: tenant.organizationId },
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ quotes });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const tenant = await requirePermission("quotes:write");
    const d = createSchema.parse(await req.json());
    const totals = calcQuote({
      items: d.items,
      discount: d.discount,
      taxRate: d.taxRate,
      taxIncluded: d.taxIncluded,
    });

    const last = await prisma.quote.findFirst({
      where: { organizationId: tenant.organizationId },
      orderBy: { number: "desc" },
      select: { number: true },
    });

    const quote = await prisma.quote.create({
      data: {
        organizationId: tenant.organizationId,
        customerId: d.customerId || null,
        number: (last?.number ?? 0) + 1,
        status: d.status,
        discount: d.discount,
        taxRate: d.taxRate,
        taxIncluded: d.taxIncluded,
        notes: d.notes || null,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        items: {
          create: d.items.map((i) => ({
            serviceId: i.serviceId || null,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        },
      },
      include: { customer: true, items: true },
    });
    return NextResponse.json({ quote });
  } catch (err) {
    return errorResponse(err);
  }
}
