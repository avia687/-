"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Copy,
  Check,
  RefreshCw,
  Pencil,
  Trash2,
  Sparkles,
  Info,
  Save,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import { PriceTiers } from "@/components/ui/price-card";
import { ScoreRing, ScoreBar } from "@/components/ui/score";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { NegotiationAssistant } from "@/components/product/negotiation";
import { dealScoreLabel } from "@/lib/market/engine";
import { categoryLabels, conditionLabels } from "@/lib/ai/types";
import { cn, formatILS } from "@/lib/utils";
import { trackClient } from "@/lib/analytics";

export type ProductDetailData = {
  id: string;
  name: string;
  category: string | null;
  condition: string | null;
  status: string;
  images: { url: string; thumbUrl: string | null }[];
  analysis: {
    estimatedValue: number;
    lowRange: number;
    highRange: number;
    recommendedPrice: number;
    quickSalePrice: number;
    maxPrice: number;
    confidence: number;
    demandScore: number;
    dealScore: number;
    scorePrice: number;
    scoreCondition: number;
    scoreDemand: number;
    scoreResale: number;
    reasoning: string | null;
  };
  listing: {
    title: string;
    description: string;
    details: Record<string, string>;
    strategy: string | null;
    startPrice: number;
    minPrice: number;
  };
  lastNegotiation: {
    buyerMessage: string;
    responses: { friendly: string; firm: string; quick: string };
  } | null;
};

export function ProductDetail({ data }: { data: ProductDetailData }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const isNew = params.get("new") === "1";

  const [status, setStatus] = React.useState(data.status);
  const [listing, setListing] = React.useState(data.listing);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const a = data.analysis;

  async function setProductStatus(next: string) {
    setStatus(next);
    await fetch(`/api/products/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (next === "active") {
      trackClient("product_saved", { productId: data.id });
      toast({ title: "המודעה סומנה כפעילה", variant: "success" });
    }
    router.refresh();
  }

  async function remove() {
    await fetch(`/api/products/${data.id}`, { method: "DELETE" });
    toast({ title: "המוצר נמחק", variant: "success" });
    router.push("/products");
    router.refresh();
  }

  return (
    <div className="animate-fade-in">
      {isNew && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success"
        >
          <Sparkles className="h-4 w-4" />
          הניתוח הושלם! הנה כל מה שצריך כדי למכור.
        </motion.div>
      )}

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              {data.name}
            </h1>
            <StatusBadge status={status} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {data.category && <span>{categoryLabels[data.category as keyof typeof categoryLabels] ?? data.category}</span>}
            {data.condition && (
              <>
                <span>·</span>
                <span>{conditionLabels[data.condition as keyof typeof conditionLabels] ?? data.condition}</span>
              </>
            )}
            <Badge variant="success" className="ms-1">
              זוהה בוודאות <span className="num">{a.confidence}%</span>
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusControl status={status} onChange={setProductStatus} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="מחיקה"
            onClick={() => setDeleteOpen(true)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Images */}
      {data.images.length > 0 && <Gallery images={data.images} />}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Value + pricing */}
        <Card>
          <CardContent>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              שווי שוק משוער ע״י AI
              <span title="הערכת AI המבוססת על מודעות דומות ומצב המוצר — אינה נתון מכירה בפועל.">
                <Info className="h-3.5 w-3.5" />
              </span>
            </div>
            <div className="num mt-1 font-display text-4xl font-extrabold tracking-tight">
              {formatILS(a.estimatedValue)}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              טווח משוער:{" "}
              <span className="num">
                {formatILS(a.lowRange)}–{formatILS(a.highRange)}
              </span>
            </div>
            <div className="mt-5">
              <PriceTiers
                quick={a.quickSalePrice}
                recommended={a.recommendedPrice}
                max={a.maxPrice}
              />
            </div>
            <p className="mt-4 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {a.reasoning ??
                "מבוסס על מודעות דומות, מצב המוצר וביקוש נוכחי בשוק."}
            </p>
          </CardContent>
        </Card>

        {/* Deal score */}
        <Card>
          <CardContent>
            <div className="flex items-center gap-5">
              <div className="flex flex-col items-center">
                <ScoreRing value={a.dealScore} size={116} label="מתוך 10" />
                <Badge
                  variant={a.dealScore >= 7 ? "success" : "warning"}
                  className="mt-2"
                >
                  {dealScoreLabel(a.dealScore)}
                </Badge>
              </div>
              <div className="flex-1 space-y-3">
                <ScoreBar label="מחיר" value={a.scorePrice} />
                <ScoreBar label="מצב" value={a.scoreCondition} />
                <ScoreBar label="ביקוש" value={a.scoreDemand} />
                <ScoreBar label="פוטנציאל מכירה" value={a.scoreResale} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Listing */}
      <ListingSection
        productId={data.id}
        listing={listing}
        onChange={setListing}
      />

      {/* Negotiation */}
      <div className="mt-5">
        <NegotiationAssistant
          productId={data.id}
          productName={data.name}
          initial={data.lastNegotiation}
        />
      </div>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} labelledBy="del-title">
        <ModalHeader
          id="del-title"
          title="למחוק את המוצר?"
          description="הפעולה תמחק את הניתוח, המודעה והתמונות. לא ניתן לשחזר."
        />
        <div className="flex gap-2">
          <Button variant="destructive" className="flex-1" onClick={remove}>
            מחיקה
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setDeleteOpen(false)}>
            ביטול
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------- Gallery ---------------- */
function Gallery({ images }: { images: { url: string; thumbUrl: string | null }[] }) {
  const [active, setActive] = React.useState(0);
  return (
    <div className="flex flex-col gap-3 sm:flex-row-reverse">
      <div className="relative aspect-[4/3] flex-1 overflow-hidden rounded-xl border bg-muted sm:max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[active].url}
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 sm:flex-col">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={cn(
                "h-16 w-16 overflow-hidden rounded-lg border-2 transition-colors",
                i === active ? "border-primary" : "border-transparent opacity-70",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.thumbUrl ?? img.url}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Status control ---------------- */
function StatusControl({
  status,
  onChange,
}: {
  status: string;
  onChange: (s: string) => void;
}) {
  const opts = [
    { v: "draft", l: "טיוטה" },
    { v: "active", l: "פעיל" },
    { v: "sold", l: "נמכר" },
  ];
  return (
    <div className="inline-flex rounded-lg border bg-card p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
            status === o.v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Listing section ---------------- */
function ListingSection({
  productId,
  listing,
  onChange,
}: {
  productId: string;
  listing: ProductDetailData["listing"];
  onChange: (l: ProductDetailData["listing"]) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [regenLoading, setRegenLoading] = React.useState(false);
  const [draft, setDraft] = React.useState(listing);

  React.useEffect(() => setDraft(listing), [listing]);

  async function copyAll() {
    const detailLines = Object.entries(listing.details)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    const text = `${listing.title}\n\n${listing.description}\n\n${detailLines}\n\nמחיר: ${formatILS(
      listing.startPrice,
    )}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    trackClient("listing_copied", { productId });
    toast({ title: "המודעה הועתקה 📋", variant: "success" });
    setTimeout(() => setCopied(false), 1800);
  }

  async function regenerate() {
    setRegenLoading(true);
    try {
      const res = await fetch("/api/listings/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const resdata = await res.json();
      if (!res.ok) throw new Error(resdata.error);
      const l = resdata.listing;
      onChange({
        ...listing,
        title: l.title,
        description: l.description,
        strategy: l.strategy,
        details: safeObj(l.detailsJson),
        startPrice: l.startPrice,
        minPrice: l.minPrice,
      });
      toast({ title: "נוצרה גרסה חדשה ✨", variant: "success" });
    } catch {
      toast({ title: "יצירה מחדש נכשלה", variant: "error" });
    } finally {
      setRegenLoading(false);
    }
  }

  async function save() {
    onChange(draft);
    setEditing(false);
    await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listing: { title: draft.title, description: draft.description },
      }),
    });
    toast({ title: "המודעה עודכנה", variant: "success" });
  }

  return (
    <Card className="mt-5">
      <CardContent>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold tracking-tight">
            המודעה שנוצרה
          </h2>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => { setDraft(listing); setEditing(false); }}>
                  <X className="h-4 w-4" />
                  ביטול
                </Button>
                <Button size="sm" onClick={save}>
                  <Save className="h-4 w-4" />
                  שמירה
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" />
                  עריכה
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={regenerate}
                  loading={regenLoading}
                >
                  <RefreshCw className="h-4 w-4" />
                  מחדש
                </Button>
                <Button size="sm" onClick={copyAll}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  העתקה
                </Button>
              </>
            )}
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Textarea
              className="min-h-[120px]"
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="כותרת">
              <p className="font-semibold">{listing.title}</p>
            </Field>
            <Field label="תיאור">
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {listing.description}
              </p>
            </Field>
            {Object.keys(listing.details).length > 0 && (
              <Field label="פרטים עיקריים">
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(listing.details).map(([k, v]) => (
                    <span
                      key={k}
                      className="rounded-md bg-muted px-2 py-1 text-xs"
                    >
                      <span className="text-muted-foreground">{k}:</span> {v}
                    </span>
                  ))}
                </div>
              </Field>
            )}
            {listing.strategy && (
              <div className="rounded-lg border border-primary/30 bg-accent/50 p-3">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-accent-foreground">
                  אסטרטגיית מכירה
                </p>
                <p className="text-sm">{listing.strategy}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function safeObj(json: string | null): Record<string, string> {
  try {
    return json ? JSON.parse(json) : {};
  } catch {
    return {};
  }
}
