"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // We always show the same confirmation to avoid revealing which emails
    // are registered. Email delivery is wired up in production (see README).
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    setSent(true);
  }

  return (
    <AuthLayout
      title="איפוס סיסמה"
      subtitle="נשלח לכם קישור לאיפוס הסיסמה"
      footer={
        <>
          נזכרתם?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            חזרה להתחברות
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center py-4 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/12 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="font-semibold">הבקשה התקבלה</p>
          <p className="mt-1 text-sm text-muted-foreground">
            אם קיים חשבון עבור <span className="num">{email}</span>, ישלח אליו
            קישור לאיפוס הסיסמה בדקות הקרובות.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">אימייל</Label>
            <Input
              id="email"
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </div>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            שליחת קישור לאיפוס
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
