import Link from "next/link";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";
import { GoogleButton } from "@/components/auth/google-button";
import { googleEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "הרשמה" };

export default function SignupPage() {
  return (
    <AuthLayout
      title="בואו נתחיל"
      subtitle="פתיחת חשבון בחינם — 5 ניתוחים ראשונים עלינו"
      footer={
        <>
          כבר יש לכם חשבון?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            התחברות
          </Link>
        </>
      }
    >
      {googleEnabled && <GoogleButton callbackUrl="/onboarding" />}
      <SignupForm />
    </AuthLayout>
  );
}
