import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTenant } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { resolveConfig } from "@/lib/business/resolve";
import { BusinessProvider } from "@/components/business-context";
import { AppShell } from "@/components/app/shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const tenant = await getTenant();
  if (!tenant) redirect("/onboarding");

  const profile = await prisma.businessProfile.findUnique({
    where: { organizationId: tenant.organizationId },
  });
  if (!profile?.onboardedAt) redirect("/onboarding");

  const config = resolveConfig(profile);

  return (
    <BusinessProvider
      value={{ config, currency: profile.currency, role: tenant.role, plan: tenant.plan }}
    >
      <AppShell user={{ name: session.user.name, email: session.user.email }}>{children}</AppShell>
    </BusinessProvider>
  );
}
