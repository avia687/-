import { Instagram, Facebook, Phone, Mail, MapPin } from "lucide-react";
import { AnimatedScissors } from "@/components/effects/AnimatedScissors";
import { site } from "@/lib/site";

const quickLinks = [
  { href: "#about", label: "אודות" },
  { href: "#services", label: "שירותים" },
  { href: "#gallery", label: "גלריה" },
  { href: "#team", label: "הצוות" },
  { href: "#booking", label: "קביעת תור" },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/5 bg-[#08080a]">
      <div className="container-edge grid gap-12 py-16 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <AnimatedScissors className="h-9 w-9" animate={false} />
            <div className="leading-none">
              <p className="font-display text-xl font-bold">{site.name}</p>
              <p className="text-[10px] uppercase tracking-[0.35em] text-primary/80">
                {site.tagline}
              </p>
            </div>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            {site.slogan}. חוויית טיפוח גברית ברמה הגבוהה ביותר, בלב {""}
            {site.addressShort.split(",")[1]?.trim() ?? "העיר"}.
          </p>
          <div className="flex gap-3 pt-2">
            <SocialIcon href={site.instagram} label="Instagram">
              <Instagram className="size-4" />
            </SocialIcon>
            <SocialIcon href={site.facebook} label="Facebook">
              <Facebook className="size-4" />
            </SocialIcon>
          </div>
        </div>

        <div>
          <h3 className="mb-4 font-display text-lg font-semibold">ניווט מהיר</h3>
          <ul className="space-y-2.5">
            {quickLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 font-display text-lg font-semibold">שעות פעילות</h3>
          <ul className="space-y-2.5">
            {site.hours.map((h) => (
              <li
                key={h.day}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="text-muted-foreground">{h.day}</span>
                <span className="text-foreground/90">{h.time}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 font-display text-lg font-semibold">יצירת קשר</h3>
          <ul className="space-y-3">
            <li>
              <a
                href={`tel:${site.phoneHref}`}
                className="flex items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                <Phone className="size-4 text-primary" />
                {site.phone}
              </a>
            </li>
            <li>
              <a
                href={`mailto:${site.email}`}
                className="flex items-center gap-3 text-sm text-muted-foreground transition-colors hover:text-primary"
              >
                <Mail className="size-4 text-primary" />
                {site.email}
              </a>
            </li>
            <li className="flex items-center gap-3 text-sm text-muted-foreground">
              <MapPin className="size-4 text-primary" />
              {site.address}
            </li>
          </ul>
        </div>
      </div>

      <div className="divider-gold" />
      <div className="container-edge flex flex-col items-center justify-between gap-3 py-6 text-xs text-muted-foreground md:flex-row">
        <p>
          © {new Date().getFullYear()} {site.name} ברברשופ. כל הזכויות שמורות.
        </p>
        <p>נבנה באהבה ובדיוק ✦</p>
      </div>
    </footer>
  );
}

function SocialIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="grid size-10 place-items-center rounded-full border border-white/10 text-foreground/80 transition-all hover:-translate-y-1 hover:border-primary/50 hover:text-primary"
    >
      {children}
    </a>
  );
}
