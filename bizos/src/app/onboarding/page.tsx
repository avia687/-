"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label, Select } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/client";
import { TEMPLATE_LIST } from "@/lib/business/templates";
import { Check, Sparkles, Wand2 } from "lucide-react";

type Proposal = {
  label: string;
  services: { name: string; category: string; price: number; durationMin: number }[];
};

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = React.useState(0);
  const [businessType, setBusinessType] = React.useState("");
  const [customText, setCustomText] = React.useState("");
  const [proposal, setProposal] = React.useState<Proposal | null>(null);
  const [proposing, setProposing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    ownerName: "",
    phone: "",
    whatsapp: "",
    address: "",
    serviceAreas: "",
    currency: "ILS",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function proposeCustom() {
    setProposing(true);
    try {
      const { proposal } = await api<{ proposal: Proposal }>("/api/ai/propose-config", {
        method: "POST",
        body: { description: customText },
      });
      setProposal(proposal);
      setBusinessType("custom");
    } catch {
      toast("שגיאה ביצירת הקונפיגורציה", "error");
    } finally {
      setProposing(false);
    }
  }

  async function finish() {
    setSaving(true);
    try {
      await api("/api/onboarding", {
        method: "POST",
        body: {
          businessType: businessType === "custom" ? "generic" : businessType,
          ...form,
          customServices: businessType === "custom" ? proposal?.services : undefined,
        },
      });
      toast("העסק שלך מוכן! 🎉");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "שגיאה", "error");
      setSaving(false);
    }
  }

  const steps = ["ברוכים הבאים", "סוג העסק", "פרטי העסק"];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* Progress */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                  i <= step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {i < step ? <Check size={16} /> : i + 1}
              </div>
              {i < steps.length - 1 && <div className="h-0.5 w-8 bg-border" />}
            </div>
          ))}
        </div>

        <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card>
            <CardContent className="pt-6">
              {step === 0 && (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                    <Sparkles size={26} />
                  </div>
                  <h1 className="text-2xl font-bold">ברוכים הבאים ל-BizOS</h1>
                  <p className="mx-auto mt-2 max-w-md text-muted-foreground">
                    מערכת אחת שמתאימה את עצמה לעסק שלך — לקוחות, לידים, הצעות מחיר, יומן, תשלומים ועוד.
                    נגדיר את העסק שלך בכמה שלבים קצרים.
                  </p>
                  <Button className="mt-6" size="lg" onClick={() => setStep(1)}>
                    בואו נתחיל
                  </Button>
                </div>
              )}

              {step === 1 && (
                <div>
                  <h2 className="text-xl font-bold">מה סוג העסק שלך?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    נבחר תבנית מתאימה — תמיד אפשר לשנות אחר כך.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {TEMPLATE_LIST.map((t) => (
                      <button
                        key={t.type}
                        onClick={() => {
                          setBusinessType(t.type);
                          setProposal(null);
                        }}
                        className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center text-sm transition-colors ${
                          businessType === t.type ? "border-primary bg-accent" : "hover:bg-secondary"
                        }`}
                      >
                        <Icon name={t.icon} size={22} className="text-primary" />
                        {t.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 rounded-xl border border-dashed p-4">
                    <Label className="flex items-center gap-1.5">
                      <Wand2 size={15} /> העסק שלך לא ברשימה? תאר אותו וה-AI יבנה סביבה מותאמת
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="לדוגמה: אני מתקן מחשבים"
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                      />
                      <Button variant="outline" onClick={proposeCustom} disabled={proposing || customText.length < 2}>
                        {proposing ? <Spinner className="h-4 w-4" /> : "צור"}
                      </Button>
                    </div>
                    {proposal && (
                      <div className="mt-3 rounded-lg bg-secondary p-3 text-sm">
                        <p className="font-medium">הצעה עבור: {proposal.label}</p>
                        <p className="mt-1 text-muted-foreground">שירותים מוצעים (ניתן לערוך אחר כך):</p>
                        <ul className="mt-1 list-inside list-disc text-muted-foreground">
                          {proposal.services.map((s, i) => (
                            <li key={i}>
                              {s.name} — ₪{s.price}
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-xs text-primary">✓ נבחר. אשר בשלב הבא כדי לשמור.</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-6 flex justify-between">
                    <Button variant="ghost" onClick={() => setStep(0)}>
                      חזרה
                    </Button>
                    <Button onClick={() => setStep(2)} disabled={!businessType}>
                      המשך
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h2 className="text-xl font-bold">פרטי העסק</h2>
                  <p className="mt-1 text-sm text-muted-foreground">כמה פרטים אחרונים ואנחנו מוכנים.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>שם העסק *</Label>
                      <Input value={form.name} onChange={set("name")} required />
                    </div>
                    <div>
                      <Label>שם בעל העסק</Label>
                      <Input value={form.ownerName} onChange={set("ownerName")} />
                    </div>
                    <div>
                      <Label>טלפון</Label>
                      <Input value={form.phone} onChange={set("phone")} dir="ltr" />
                    </div>
                    <div>
                      <Label>WhatsApp</Label>
                      <Input value={form.whatsapp} onChange={set("whatsapp")} dir="ltr" />
                    </div>
                    <div>
                      <Label>מטבע</Label>
                      <Select value={form.currency} onChange={set("currency")}>
                        <option value="ILS">₪ שקל</option>
                        <option value="USD">$ דולר</option>
                        <option value="EUR">€ אירו</option>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label>כתובת</Label>
                      <Input value={form.address} onChange={set("address")} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>אזורי שירות</Label>
                      <Input value={form.serviceAreas} onChange={set("serviceAreas")} placeholder="תל אביב, מרכז..." />
                    </div>
                  </div>
                  <div className="mt-6 flex justify-between">
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      חזרה
                    </Button>
                    <Button onClick={finish} disabled={saving || !form.name}>
                      {saving ? "יוצר סביבת עבודה..." : "סיום והתחלה"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
