import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/session-guards";

/** Standard JSON error envelope. */
export function jsonError(status: number, message: string, code?: string) {
  return NextResponse.json({ error: message, code }, { status });
}

/** Convert thrown errors into a consistent JSON response. */
export function handleApiError(err: unknown) {
  if (err instanceof ApiError) {
    return jsonError(err.status, err.message, err.code);
  }
  if (err instanceof ZodError) {
    const first = err.errors[0];
    return jsonError(422, first?.message ?? "קלט לא תקין", "invalid_input");
  }
  console.error("[api] unhandled error:", err);
  return jsonError(500, "אירעה שגיאה בשרת. נסו שוב.", "server_error");
}

/** Extract a client IP from request headers (best-effort). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "0.0.0.0";
}
