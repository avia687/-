import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "BizOS — מערכת הפעלה לעסק",
  description: "מערכת SaaS לניהול עסקים קטנים ובינוניים — לקוחות, לידים, הצעות מחיר, יומן ועוד.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
