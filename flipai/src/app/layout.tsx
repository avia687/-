import type { Metadata, Viewport } from "next";
import { Heebo, Rubik } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  variable: "--font-sans",
  display: "swap",
});

const rubik = Rubik({
  subsets: ["hebrew", "latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const siteUrl = process.env.APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "FlipAI — תמכרו חכם עם AI",
    template: "%s · FlipAI",
  },
  description:
    "העלו תמונת מוצר וקבלו את המחיר הנכון, מודעה מקצועית וכל מה שצריך כדי למכור מהר יותר וביותר כסף. בינה מלאכותית למוכרים ביד שנייה.",
  keywords: [
    "יד שנייה",
    "מכירה",
    "הערכת שווי",
    "בינה מלאכותית",
    "מודעה",
    "יד2",
    "פייסבוק מרקטפלייס",
  ],
  authors: [{ name: "FlipAI" }],
  openGraph: {
    type: "website",
    locale: "he_IL",
    url: siteUrl,
    siteName: "FlipAI",
    title: "FlipAI — תמכרו חכם עם AI",
    description:
      "העלו מוצר. קבלו מחיר מדויק, מודעה טובה יותר וכל מה שצריך כדי למכור מהר.",
  },
  twitter: {
    card: "summary_large_image",
    title: "FlipAI — תמכרו חכם עם AI",
    description:
      "העלו מוצר. קבלו מחיר מדויק, מודעה טובה יותר וכל מה שצריך כדי למכור מהר.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e18" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="he"
      dir="rtl"
      suppressHydrationWarning
      className={`${heebo.variable} ${rubik.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
