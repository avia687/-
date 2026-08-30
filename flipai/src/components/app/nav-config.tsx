import {
  LayoutDashboard,
  Sparkles,
  Package,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  primary?: boolean;
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "בית", icon: LayoutDashboard },
  { href: "/analyze", label: "ניתוח", icon: Sparkles, primary: true },
  { href: "/products", label: "מוצרים", icon: Package },
  { href: "/settings", label: "פרופיל", icon: Settings },
];
