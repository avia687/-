"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { motion } from "framer-motion";
import { Bell, LogOut, Menu, Moon, Search, Sun, X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { buildNav } from "@/components/app/nav";
import { useBusiness } from "@/components/business-context";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/app/global-search";
import { NotificationsMenu } from "@/components/app/notifications-menu";

export function AppShell({
  user,
  children,
}: {
  user: { name?: string | null; email?: string | null };
  children: React.ReactNode;
}) {
  const { config, role } = useBusiness();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const nav = buildNav(config).filter((i) => !i.permission || can(role, i.permission));
  const primary = nav.filter((i) => i.primary).slice(0, 4);

  React.useEffect(() => setMobileOpen(false), [pathname]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-64 flex-col border-l bg-card lg:flex">
        <Brand config={config} />
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}
        </nav>
        <UserFooter user={user} roleLabel={role} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <motion.aside
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="absolute inset-y-0 right-0 flex w-72 flex-col bg-card"
          >
            <div className="flex items-center justify-between p-4">
              <Brand config={config} compact />
              <button onClick={() => setMobileOpen(false)} className="rounded-md p-2 hover:bg-secondary">
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
              {nav.map((item) => (
                <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
              ))}
            </nav>
            <UserFooter user={user} roleLabel={role} />
          </motion.aside>
        </div>
      )}

      {/* Main column */}
      <div className="lg:pr-64">
        <Topbar
          onMenu={() => setMobileOpen(true)}
          onSearch={() => setSearchOpen(true)}
        />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6 lg:pb-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-card/95 backdrop-blur lg:hidden">
        {primary.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon name={item.icon} size={20} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground"
        >
          <Menu size={20} />
          <span>עוד</span>
        </button>
      </nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function Brand({ config, compact }: { config: ReturnType<typeof useBusiness>["config"]; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 border-b p-4", compact && "border-0 p-0")}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Icon name={config.icon} size={18} />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">BizOS</p>
        <p className="text-xs text-muted-foreground">{config.label}</p>
      </div>
    </div>
  );
}

function NavLink({ item, active }: { item: ReturnType<typeof buildNav>[number]; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary",
      )}
    >
      <Icon name={item.icon} size={18} />
      {item.label}
    </Link>
  );
}

function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background/80 px-4 py-3 backdrop-blur sm:px-6">
      <button onClick={onMenu} className="rounded-md p-2 hover:bg-secondary lg:hidden" aria-label="תפריט">
        <Menu size={20} />
      </button>
      <button
        onClick={onSearch}
        className="flex flex-1 items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground hover:bg-secondary sm:max-w-xs"
      >
        <Search size={16} />
        <span>חיפוש...</span>
        <kbd className="mr-auto hidden rounded border px-1.5 text-[10px] sm:inline">⌘K</kbd>
      </button>
      <div className="mr-auto flex items-center gap-1">
        <NotificationsMenu />
        <ThemeToggle />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="rounded-md p-2 hover:bg-secondary"
      aria-label="החלף מצב תצוגה"
    >
      {mounted && theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function UserFooter({
  user,
  roleLabel,
}: {
  user: { name?: string | null; email?: string | null };
  roleLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 border-t p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
        {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium">{user.name ?? "משתמש"}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="rounded-md p-2 text-muted-foreground hover:bg-secondary"
        aria-label="התנתק"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}
