"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { categoryLabels, CATEGORIES, type Category } from "@/lib/ai/types";

const freqLabels: Record<string, string> = {
  occasionally: "מדי פעם",
  monthly: "כל חודש",
  frequently: "לעיתים קרובות",
};

export function ProfileForm({
  name,
  email,
  sellCategory,
  sellFrequency,
}: {
  name: string;
  email: string;
  sellCategory: string | null;
  sellFrequency: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = React.useState({
    name,
    sellCategory: (sellCategory ?? "other") as Category,
    sellFrequency: sellFrequency ?? "occasionally",
  });
  const [loading, setLoading] = React.useState(false);

  async function save() {
    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast({ title: "הפרופיל נשמר", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "השמירה נכשלה", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight">פרטים אישיים</h2>
          <p className="text-sm text-muted-foreground">עדכנו את הפרופיל שלכם</p>
        </div>

        <div>
          <Label htmlFor="name">שם מלא</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="email">אימייל</Label>
          <Input id="email" value={email} dir="ltr" disabled />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="cat">קטגוריה עיקרית</Label>
            <select
              id="cat"
              value={form.sellCategory}
              onChange={(e) =>
                setForm({ ...form, sellCategory: e.target.value as Category })
              }
              className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {categoryLabels[c]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="freq">תדירות מכירה</Label>
            <select
              id="freq"
              value={form.sellFrequency}
              onChange={(e) =>
                setForm({ ...form, sellFrequency: e.target.value })
              }
              className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {Object.entries(freqLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} loading={loading}>
            שמירת שינויים
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
