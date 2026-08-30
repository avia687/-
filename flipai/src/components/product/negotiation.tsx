"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { MessageSquare, Send, Copy, Check, Smile, Shield, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { trackClient } from "@/lib/analytics";

type Responses = { friendly: string; firm: string; quick: string };

const TONES: {
  key: keyof Responses;
  label: string;
  icon: React.ReactNode;
  cls: string;
}[] = [
  { key: "friendly", label: "ידידותי", icon: <Smile className="h-4 w-4" />, cls: "text-success" },
  { key: "firm", label: "תקיף", icon: <Shield className="h-4 w-4" />, cls: "text-primary" },
  { key: "quick", label: "סגירה מהירה", icon: <Zap className="h-4 w-4" />, cls: "text-warning" },
];

export function NegotiationAssistant({
  productId,
  productName,
  initial,
}: {
  productId: string;
  productName: string;
  initial: { buyerMessage: string; responses: Responses } | null;
}) {
  const { toast } = useToast();
  const [message, setMessage] = React.useState(initial?.buyerMessage ?? "");
  const [responses, setResponses] = React.useState<Responses | null>(
    initial?.responses ?? null,
  );
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState<keyof Responses | null>(null);

  async function generate() {
    if (!message.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, buyerMessage: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResponses(data.responses);
      trackClient("negotiation_generated", { productId });
    } catch {
      toast({ title: "לא הצלחנו ליצור תשובות", variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function copy(key: keyof Responses) {
    if (!responses) return;
    await navigator.clipboard.writeText(responses[key]);
    setCopied(key);
    toast({ title: "התשובה הועתקה 📋", variant: "success" });
    setTimeout(() => setCopied(null), 1600);
  }

  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary">
            <MessageSquare className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">
              עוזר משא ומתן
            </h2>
            <p className="text-xs text-muted-foreground">
              הדביקו הודעה מקונה וקבלו שלוש תשובות מוכנות
            </p>
          </div>
        </div>

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={600}
          placeholder={`לדוגמה: "מה המחיר האחרון? אפשר לבוא היום"`}
          className="min-h-[70px]"
        />
        <div className="mt-2 flex justify-end">
          <Button onClick={generate} loading={loading} disabled={!message.trim()}>
            <Send className="h-4 w-4" />
            צרו תשובות
          </Button>
        </div>

        {responses && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {TONES.map((tone, i) => (
              <motion.div
                key={tone.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex flex-col rounded-xl border bg-background p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className={cn("inline-flex items-center gap-1.5 text-sm font-semibold", tone.cls)}>
                    {tone.icon}
                    {tone.label}
                  </span>
                  <button
                    onClick={() => copy(tone.key)}
                    aria-label="העתקה"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {copied === tone.key ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <p className="flex-1 text-sm leading-relaxed">{responses[tone.key]}</p>
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
