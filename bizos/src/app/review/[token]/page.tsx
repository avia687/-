import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ReviewForm } from "./form";

export const dynamic = "force-dynamic";

export default async function PublicReviewPage({ params }: { params: { token: string } }) {
  const review = await prisma.review.findUnique({
    where: { publicToken: params.token },
    include: { organization: { include: { profile: true } } },
  });
  if (!review) notFound();

  const profile = review.organization.profile;
  const brand = profile?.brandColor ?? "#4f46e5";

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4 py-8" dir="rtl">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border bg-card text-center shadow-sm">
        <div className="p-6 text-white" style={{ background: brand }}>
          <h1 className="text-xl font-bold">{profile?.name}</h1>
          <p className="mt-1 text-sm opacity-90">נשמח לשמוע איך היה!</p>
        </div>
        <div className="p-6">
          {review.submittedAt ? (
            <p className="py-6 text-muted-foreground">תודה! כבר קיבלנו את הביקורת שלך 🙏</p>
          ) : (
            <ReviewForm token={params.token} brand={brand} />
          )}
        </div>
      </div>
    </div>
  );
}
