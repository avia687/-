import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
      <header className="relative flex items-center justify-between px-5 py-4">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-extrabold tracking-tight">
              {title}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>
          <div className="rounded-2xl border bg-card p-6 shadow-card">
            {children}
          </div>
          {footer && (
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {footer}
            </p>
          )}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              ← חזרה לדף הבית
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
