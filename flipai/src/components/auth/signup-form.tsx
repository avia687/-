"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "ההרשמה נכשלה. נסו שוב.");
        setLoading(false);
        return;
      }
      // Auto sign-in, then head to onboarding.
      const signRes = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (signRes?.error) {
        router.push("/login");
        return;
      }
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("אירעה שגיאה. בדקו את החיבור ונסו שוב.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
      <div>
        <Label htmlFor="name">שם מלא</Label>
        <Input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ישראל ישראלי"
        />
      </div>
      <div>
        <Label htmlFor="email">אימייל</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.com"
        />
      </div>
      <div>
        <Label htmlFor="password">סיסמה</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="לפחות 8 תווים"
        />
      </div>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        יצירת חשבון
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        בהרשמה אתם מאשרים את תנאי השימוש ומדיניות הפרטיות
      </p>
    </form>
  );
}
