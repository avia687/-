"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          <a href="/#features" className="transition-colors hover:text-foreground">
            יכולות
          </a>
          <a href="/#how" className="transition-colors hover:text-foreground">
            איך זה עובד
          </a>
          <Link href="/pricing" className="transition-colors hover:text-foreground">
            מחירים
          </Link>
          <a href="/#faq" className="transition-colors hover:text-foreground">
            שאלות נפוצות
          </a>
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link href="/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">
              התחברות
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm">התחילו בחינם</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
