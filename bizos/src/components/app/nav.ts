import type { BusinessConfig } from "@/lib/business/types";
import type { Permission } from "@/lib/rbac";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // lucide icon name
  permission?: Permission;
  primary?: boolean; // shown in mobile bottom nav
};

/** Nav is a function of the resolved config so labels follow terminology. */
export function buildNav(config: BusinessConfig): NavItem[] {
  const t = config.terminology;
  return [
    { href: "/dashboard", label: "דשבורד", icon: "LayoutDashboard", primary: true },
    { href: "/customers", label: t.customers, icon: "Users", permission: "customers:read", primary: true },
    { href: "/leads", label: t.leads, icon: "Filter", permission: "leads:read", primary: true },
    { href: "/quotes", label: "הצעות מחיר", icon: "FileText", permission: "quotes:read" },
    { href: "/services", label: t.services, icon: "Tag", permission: "services:read" },
    { href: "/calendar", label: "יומן", icon: "Calendar", permission: "jobs:read", primary: true },
    { href: "/payments", label: "תשלומים", icon: "Wallet", permission: "payments:read" },
    { href: "/expenses", label: "הוצאות", icon: "Receipt", permission: "expenses:read" },
    { href: "/employees", label: t.employees, icon: "UserCog", permission: "employees:read" },
    { href: "/reviews", label: "ביקורות", icon: "Star", permission: "reviews:read" },
    { href: "/messages", label: "הודעות", icon: "MessageCircle", permission: "customers:read" },
    { href: "/automations", label: "אוטומציות", icon: "Zap", permission: "settings:read" },
    { href: "/marketing", label: "שיווק", icon: "Megaphone", permission: "marketing:read" },
    { href: "/assistant", label: "עוזר AI", icon: "Sparkles", permission: "ai:use" },
    { href: "/settings", label: "הגדרות", icon: "Settings", permission: "settings:read" },
  ];
}
