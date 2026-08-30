import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/app/app-shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const sub = await prisma.subscription.findUnique({
    where: { userId: session.user.id },
    select: { plan: true },
  });

  // Users who haven't completed onboarding are routed there first.
  if (!session.user.onboarded) redirect("/onboarding");

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
        plan: sub?.plan ?? "free",
      }}
    >
      {children}
    </AppShell>
  );
}
