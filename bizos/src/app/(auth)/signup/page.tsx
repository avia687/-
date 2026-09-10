"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label } from "@/components/ui/primitives";
import { api } from "@/lib/client";
import { Sparkles } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [callbackUrl, setCallbackUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    setCallbackUrl(new URLSearchParams(window.location.search).get("callbackUrl"));
  }, []);
  const [form, setForm] = React.useState({ name: "", email: "", password: "" });
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/register", { method: "POST", body: form });
      await signIn("credentials", { email: form.email, password: form.password, redirect: false });
      // Invited teammates go straight to accept their invite; new owners onboard.
      router.push(callbackUrl || "/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בהרשמה");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles size={22} />
          </div>
          <h1 className="text-xl font-bold">פתיחת חשבון</h1>
          <p className="mt-1 text-sm text-muted-foreground">התחל לנהל את העסק שלך בחינם</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>שם מלא</Label>
            <Input value={form.name} onChange={set("name")} required />
          </div>
          <div>
            <Label>אימייל</Label>
            <Input type="email" value={form.email} onChange={set("email")} required dir="ltr" />
          </div>
          <div>
            <Label>סיסמה</Label>
            <Input type="password" value={form.password} onChange={set("password")} required minLength={6} dir="ltr" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "יוצר חשבון..." : "המשך"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          כבר יש לך חשבון?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            התחברות
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
