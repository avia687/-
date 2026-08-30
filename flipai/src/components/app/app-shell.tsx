"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, Plus, ShieldCheck, Sparkles, User } from "lucide-react";
import { navItems } from "@/components/app/nav-config";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Dropdown, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";

export type ShellUser = {
  name?: string | null;
  email?: string | null;
  role?: string;
  plan?: string;
};

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const initial = (user.name || user.email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-60 flex-col border-e bg-card/60 px-3 py-5 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="mt-8 flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          {user.role === "admin" && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive(pathname, "/admin")
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <ShieldCheck className="h-5 w-5" />
              ניהול
            </Link>
          )}
        </nav>

        <Link
          href="/analyze"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-accent transition-all hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          נתח מוצר
        </Link>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur lg:pe-6 lg:ps-[16rem]">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="hidden lg:block" />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Dropdown
            trigger={
              <button className="flex h-10 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-muted">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
                  {initial}
                </span>
                <span className="hidden text-sm font-medium sm:block">
                  {user.name || "החשבון שלי"}
                </span>
              </button>
            }
          >
            {(close) => (
              <>
                <div className="px-2.5 py-2">
                  <p className="truncate text-sm font-semibold">
                    {user.name || "משתמש"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                  {user.plan && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">
                      <Sparkles className="h-3 w-3" />
                      מסלול {planLabel(user.plan)}
                    </span>
                  )}
                </div>
                <DropdownSeparator />
                <Link href="/settings" onClick={close}>
                  <DropdownItem>
                    <User className="h-4 w-4" />
                    הגדרות חשבון
                  </DropdownItem>
                </Link>
                <DropdownItem
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <LogOut className="h-4 w-4" />
                  התנתקות
                </DropdownItem>
              </>
            )}
          </Dropdown>
        </div>
      </header>

      {/* Main */}
      <main className="px-4 pb-24 pt-6 lg:ps-[16rem] lg:pe-6 lg:pb-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/90 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            if (item.primary) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center py-1.5"
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 -translate-y-3 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-accent transition-transform",
                      active && "scale-105",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="-mt-2 text-[11px] font-medium text-primary">
                    {item.label}
                  </span>
                </Link>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function planLabel(plan: string) {
  return plan === "pro" ? "Pro" : plan === "seller" ? "Seller" : "חינם";
}
