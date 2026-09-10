"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, Input, Label } from "@/components/ui/primitives";
import { Sparkles } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("אימייל או סיסמה שגויים");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles size={22} />
          </div>
          <h1 className="text-xl font-bold">התחברות ל-BizOS</h1>
          <p className="mt-1 text-sm text-muted-foreground">מערכת ההפעלה לעסק שלך</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>אימייל</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
          </div>
          <div>
            <Label>סיסמה</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "מתחבר..." : "התחבר"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          אין לך חשבון?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            הרשמה
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
