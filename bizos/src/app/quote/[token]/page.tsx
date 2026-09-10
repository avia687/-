import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveConfig } from "@/lib/business/resolve";
import { formatMoney, formatDate } from "@/lib/utils";
import { QuoteActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function PublicQuotePage({ params }: { params: { token: string } }) {
  const quote = await prisma.quote.findUnique({
    where: { publicToken: params.token },
    include: { items: true, customer: true, organization: { include: { profile: true } } },
  });
  if (!quote) notFound();

  const profile = quote.organization.profile;
  const config = resolveConfig(profile);
  const currency = profile?.currency ?? "ILS";
  const brand = profile?.brandColor ?? "#4f46e5";

  return (
    <div className="min-h-screen bg-secondary px-4 py-8" dir="rtl">
      <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="p-6 text-white" style={{ background: brand }}>
          <p className="text-sm opacity-90">{config.label}</p>
          <h1 className="text-2xl font-bold">{profile?.name}</h1>
          {profile?.phone && <p className="mt-1 text-sm opacity-90" dir="ltr">{profile.phone}</p>}
        </div>

        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-lg font-bold">הצעת מחיר #{quote.number}</p>
              <p className="text-sm text-muted-foreground">{formatDate(quote.createdAt)}</p>
            </div>
            {quote.customer && <p className="text-sm text-muted-foreground">עבור: {quote.customer.name}</p>}
          </div>

          <div className="divide-y rounded-lg border">
            {quote.items.map((it) => (
              <div key={it.id} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-medium">{it.name}</p>
                  {it.quantity > 1 && <p className="text-xs text-muted-foreground">{it.quantity} × {formatMoney(it.unitPrice, currency)}</p>}
                </div>
                <span className="font-medium">{formatMoney(it.quantity * it.unitPrice, currency)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between"><span>ביניים</span><span>{formatMoney(quote.subtotal, currency)}</span></div>
            {quote.discount > 0 && <div className="flex justify-between text-green-600"><span>הנחה</span><span>-{formatMoney(quote.discount, currency)}</span></div>}
            <div className="flex justify-between text-muted-foreground"><span>מע"מ</span><span>{formatMoney(quote.taxAmount, currency)}</span></div>
            <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>סה"כ לתשלום</span><span>{formatMoney(quote.total, currency)}</span></div>
          </div>

          {quote.notes && <p className="mt-4 rounded-lg bg-secondary p-3 text-sm text-muted-foreground">{quote.notes}</p>}

          <QuoteActions token={params.token} status={quote.status} brand={brand} />
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">מופעל על ידי BizOS</p>
    </div>
  );
}
