import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { resolveConfig } from "@/lib/business/resolve";
import { Card, CardContent, Badge } from "@/components/ui/primitives";
import { formatMoney, formatDate } from "@/lib/utils";
import { ArrowRight, Phone, Mail, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CustomerDetail({ params }: { params: { id: string } }) {
  const tenant = await requireTenant();
  const org = tenant.organizationId;
  const profile = await prisma.businessProfile.findUnique({ where: { organizationId: org } });
  const config = resolveConfig(profile);
  const currency = profile?.currency ?? "ILS";

  const customer = await prisma.customer.findFirst({
    where: { id: params.id, organizationId: org },
    include: {
      jobs: { orderBy: { startAt: "desc" }, include: { employee: true } },
      quotes: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      reviews: true,
    },
  });
  if (!customer) notFound();

  const totalPaid = customer.payments.filter((p) => p.status === "paid").reduce((a, p) => a + p.amount, 0);
  const outstanding = customer.payments.filter((p) => p.status !== "paid").reduce((a, p) => a + p.amount, 0);

  return (
    <div className="space-y-5">
      <Link href="/customers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight size={15} /> חזרה ל{config.terminology.customers}
      </Link>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
            {customer.name.charAt(0)}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{customer.name}</h1>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {customer.phone && <span className="flex items-center gap-1"><Phone size={13} /> {customer.phone}</span>}
              {customer.email && <span className="flex items-center gap-1"><Mail size={13} /> {customer.email}</span>}
              {customer.address && <span className="flex items-center gap-1"><MapPin size={13} /> {customer.address}</span>}
            </div>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">שולם</p>
              <p className="font-bold text-green-600">{formatMoney(totalPaid, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">חוב</p>
              <p className="font-bold text-red-600">{formatMoney(outstanding, currency)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {customer.notes && (
        <Card>
          <CardContent className="pt-5 text-sm">
            <p className="mb-1 font-semibold">הערות</p>
            <p className="text-muted-foreground">{customer.notes}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <HistoryCard title={`${config.terminology.jobs} (${customer.jobs.length})`}>
          {customer.jobs.length === 0 ? (
            <Empty />
          ) : (
            customer.jobs.map((j) => (
              <Row key={j.id} title={j.title} sub={formatDate(j.startAt, true)} value={formatMoney(j.price, currency)}>
                <Badge color={j.status === "done" ? "green" : j.status === "cancelled" ? "red" : "blue"}>{j.status}</Badge>
              </Row>
            ))
          )}
        </HistoryCard>

        <HistoryCard title={`הצעות מחיר (${customer.quotes.length})`}>
          {customer.quotes.length === 0 ? (
            <Empty />
          ) : (
            customer.quotes.map((q) => (
              <Row key={q.id} title={`הצעה #${q.number}`} sub={formatDate(q.createdAt)} value={formatMoney(q.total, currency)}>
                <Badge color={q.status === "approved" ? "green" : q.status === "rejected" ? "red" : "amber"}>{q.status}</Badge>
              </Row>
            ))
          )}
        </HistoryCard>

        <HistoryCard title={`תשלומים (${customer.payments.length})`}>
          {customer.payments.length === 0 ? (
            <Empty />
          ) : (
            customer.payments.map((p) => (
              <Row key={p.id} title={formatMoney(p.amount, currency)} sub={formatDate(p.createdAt)}>
                <Badge color={p.status === "paid" ? "green" : "amber"}>{p.status}</Badge>
              </Row>
            ))
          )}
        </HistoryCard>

        <HistoryCard title={`ביקורות (${customer.reviews.length})`}>
          {customer.reviews.length === 0 ? (
            <Empty />
          ) : (
            customer.reviews.map((r) => (
              <Row key={r.id} title={r.rating ? `${"⭐".repeat(r.rating)}` : "ממתין לביקורת"} sub={r.comment ?? ""} />
            ))
          )}
        </HistoryCard>
      </div>
    </div>
  );
}

function HistoryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="mb-2 text-sm font-semibold">{title}</p>
        <div className="divide-y">{children}</div>
      </CardContent>
    </Card>
  );
}

function Row({
  title,
  sub,
  value,
  children,
}: {
  title: string;
  sub?: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{title}</p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        {value && <span className="font-medium">{value}</span>}
        {children}
      </div>
    </div>
  );
}

function Empty() {
  return <p className="py-4 text-center text-sm text-muted-foreground">אין נתונים</p>;
}
