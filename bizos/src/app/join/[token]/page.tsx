"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/primitives";
import { api } from "@/lib/client";
import { Users } from "lucide-react";

export default function JoinPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { status } = useSession();
  const [error, setError] = React.useState("");
  const [joining, setJoining] = React.useState(false);
  const callback = `/join/${params.token}`;

  async function join() {
    setJoining(true);
    setError("");
    try {
      await api("/api/invites/accept", { method: "POST", body: { token: params.token } });
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
      setJoining(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Users size={22} />
          </div>
          <h1 className="text-xl font-bold">הצטרפות לצוות</h1>
          <p className="mt-1 text-sm text-muted-foreground">הוזמנת להצטרף לעסק ב-BizOS</p>

          {status === "loading" ? (
            <p className="mt-6 text-sm text-muted-foreground">טוען...</p>
          ) : status === "authenticated" ? (
            <>
              {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
              <Button className="mt-6 w-full" onClick={join} disabled={joining}>
                {joining ? "מצטרף..." : "אשר הצטרפות"}
              </Button>
            </>
          ) : (
            <div className="mt-6 space-y-2">
              <p className="text-sm text-muted-foreground">התחבר או הירשם כדי להמשיך</p>
              <Link href={`/login?callbackUrl=${encodeURIComponent(callback)}`}>
                <Button className="w-full">התחברות</Button>
              </Link>
              <Link href={`/signup?callbackUrl=${encodeURIComponent(callback)}`}>
                <Button variant="outline" className="w-full">הרשמה</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
