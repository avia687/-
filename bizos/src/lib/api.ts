import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/tenant";
import { LimitError } from "@/lib/subscription";
import { RateLimitError } from "@/lib/ratelimit";

/** Wraps a route handler, translating known errors into JSON responses. */
export function handler<T>(fn: () => Promise<T>) {
  return async () => {
    try {
      const data = await fn();
      return NextResponse.json(data ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown) {
  if (err instanceof RateLimitError) {
    return NextResponse.json({ error: err.message }, { status: 429 });
  }
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof LimitError) {
    return NextResponse.json({ error: err.message, limit: err.limitKey }, { status: 402 });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "נתונים לא תקינים", issues: err.flatten() },
      { status: 422 },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "שגיאת שרת" }, { status: 500 });
}
