import Link from "next/link";
import { Logo } from "@/components/logo";

export function MarketingFooter() {
  return (
    <footer className="border-t bg-card/40">
      <div className="container flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <Logo />
          <p className="text-sm text-muted-foreground">
            תמכרו חכם עם AI · {new Date().getFullYear()}
          </p>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <Link href="/pricing" className="hover:text-foreground">
            מחירים
          </Link>
          <Link href="/login" className="hover:text-foreground">
            התחברות
          </Link>
          <Link href="/signup" className="hover:text-foreground">
            הרשמה
          </Link>
          <a href="/#faq" className="hover:text-foreground">
            שאלות נפוצות
          </a>
        </nav>
      </div>
    </footer>
  );
}
