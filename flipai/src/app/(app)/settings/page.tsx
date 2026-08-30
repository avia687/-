import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUsageStatus } from "@/lib/usage";
import { PageHeader } from "@/components/app/page-header";
import { ProfileForm } from "@/components/app/profile-form";
import { SubscriptionPanel } from "@/components/app/subscription-panel";
import { UsageMeter } from "@/components/app/usage-meter";

export const metadata: Metadata = { title: "הגדרות" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [user, sub, usage] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.subscription.findUnique({ where: { userId } }),
    getUsageStatus(userId),
  ]);

  return (
    <div className="animate-fade-in">
      <PageHeader title="הגדרות" subtitle="פרופיל, מנוי ושימוש" />

      <div className="grid gap-5">
        <UsageMeter plan={usage.plan} used={usage.used} limit={usage.limit} />

        <ProfileForm
          name={user?.name ?? ""}
          email={user?.email ?? ""}
          sellCategory={user?.sellCategory ?? null}
          sellFrequency={user?.sellFrequency ?? null}
        />

        <SubscriptionPanel
          plan={sub?.plan ?? "free"}
          simulated={sub?.provider === "mock" && sub?.plan !== "free"}
        />
      </div>
    </div>
  );
}
