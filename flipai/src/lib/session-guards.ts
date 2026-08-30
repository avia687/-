import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** For server components: returns the session or redirects to /login. */
export async function requirePageUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return session;
}

/** For server components: requires admin, else redirect. */
export async function requireAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "admin") redirect("/dashboard");
  return session;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** For API routes: returns the user session or throws ApiError(401). */
export async function requireApiUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError(401, "עליך להתחבר כדי לבצע פעולה זו", "unauthorized");
  }
  return session;
}
