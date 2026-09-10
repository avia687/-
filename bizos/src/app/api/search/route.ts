import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { errorResponse } from "@/lib/api";
import { requireTenant } from "@/lib/tenant";
import { formatMoney } from "@/lib/utils";

// Global search across the main entities, tenant-scoped.
export async function GET(req: Request) {
  try {
    const tenant = await requireTenant();
    const org = tenant.organizationId;
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q) return NextResponse.json({ results: [] });

    const [customers, leads, quotes, jobs] = await Promise.all([
      prisma.customer.findMany({
        where: { organizationId: org, OR: [{ name: { contains: q } }, { phone: { contains: q } }] },
        take: 5,
      }),
      prisma.lead.findMany({
        where: { organizationId: org, OR: [{ title: { contains: q } }, { contactName: { contains: q } }] },
        take: 5,
      }),
      prisma.quote.findMany({
        where: { organizationId: org, customer: { name: { contains: q } } },
        include: { customer: true },
        take: 5,
      }),
      prisma.job.findMany({
        where: { organizationId: org, OR: [{ title: { contains: q } }, { serviceName: { contains: q } }] },
        take: 5,
      }),
    ]);

    const results = [
      ...customers.map((c) => ({
        type: "לקוח",
        label: c.name,
        sublabel: c.phone ?? undefined,
        href: `/customers/${c.id}`,
        icon: "User",
      })),
      ...leads.map((l) => ({
        type: "ליד",
        label: l.title,
        sublabel: l.contactName ?? undefined,
        href: `/leads`,
        icon: "Filter",
      })),
      ...quotes.map((qt) => ({
        type: "הצעה",
        label: `הצעה #${qt.number}`,
        sublabel: `${qt.customer?.name ?? ""} · ${formatMoney(qt.total)}`,
        href: `/quotes`,
        icon: "FileText",
      })),
      ...jobs.map((j) => ({
        type: "עבודה",
        label: j.title,
        sublabel: j.serviceName ?? undefined,
        href: `/calendar`,
        icon: "Calendar",
      })),
    ];
    return NextResponse.json({ results });
  } catch (err) {
    return errorResponse(err);
  }
}
