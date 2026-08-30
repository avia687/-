"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("אימייל או סיסמה שגויים");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
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
        <div className="mb-1.5 flex items-center justify-between">
          <Label htmlFor="password" className="mb-0">
            סיסמה
          </Label>
          <a
            href="/forgot-password"
            className="text-xs text-primary hover:underline"
          >
            שכחתם סיסמה?
          </a>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        התחברות
      </Button>
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
        התחברות לדוגמה: <span className="num">demo@flipai.co</span> /{" "}
        <span className="num">demo1234</span>
      </p>
    </form>
  );
}
