import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { GoogleButton } from "@/components/auth/google-button";
import { googleEnabled } from "@/lib/auth";

export const metadata: Metadata = { title: "התחברות" };

export default function LoginPage() {
  return (
    <AuthLayout
      title="ברוכים השבים"
      subtitle="התחברו כדי להמשיך למכור חכם יותר"
      footer={
        <>
          עדיין אין לכם חשבון?{" "}
          <Link href="/signup" className="font-semibold text-primary hover:underline">
            הרשמה
          </Link>
        </>
      }
    >
      {googleEnabled && <GoogleButton callbackUrl="/dashboard" />}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
