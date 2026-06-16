"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Phone } from "lucide-react";
import { AnimatedScissors } from "@/components/effects/AnimatedScissors";
import { Button } from "@/components/ui/button";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const links = [
  { href: "#about", label: "אודות" },
  { href: "#services", label: "שירותים" },
  { href: "#gallery", label: "גלריה" },
  { href: "#team", label: "הצוות" },
  { href: "#reviews", label: "ביקורות" },
  { href: "#contact", label: "צור קשר" },
];

export function Navbar() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled ? "glass-strong shadow-lg shadow-black/30" : "bg-transparent",
      )}
    >
      <nav
        aria-label="ניווט ראשי"
        className="container-edge flex h-[72px] items-center justify-between"
      >
        <a
          href="#hero"
          className="flex items-center gap-2.5"
          aria-label={`${site.name} — לעמוד הבית`}
        >
          <AnimatedScissors className="h-9 w-9" />
          <span className="flex flex-col leading-none">
            <span className="font-display text-xl font-bold tracking-wide">
              {site.name}
            </span>
            <span className="text-[10px] uppercase tracking-[0.35em] text-primary/80">
              {site.tagline}
            </span>
          </span>
        </a>

        {/* Desktop links */}
        <ul className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="group relative rounded-full px-4 py-2 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground"
              >
                {link.label}
                <span className="absolute inset-x-4 -bottom-0.5 h-px origin-right scale-x-0 bg-gold-gradient transition-transform duration-300 group-hover:scale-x-100" />
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3">
          <a
            href={`tel:${site.phoneHref}`}
            className="hidden items-center gap-2 text-sm text-foreground/80 transition-colors hover:text-primary md:flex"
          >
            <Phone className="size-4" />
            {site.phone}
          </a>
          <Button
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => scrollTo("#booking")}
          >
            קבע תור
          </Button>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid size-11 place-items-center rounded-full border border-white/10 text-foreground lg:hidden"
            aria-label={open ? "סגור תפריט" : "פתח תפריט"}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden border-t border-white/5 glass-strong lg:hidden"
          >
            <ul className="container-edge flex flex-col py-4">
              {links.map((link, i) => (
                <motion.li
                  key={link.href}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i }}
                >
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block border-b border-white/5 py-3 text-base text-foreground/80 transition-colors hover:text-primary"
                  >
                    {link.label}
                  </a>
                </motion.li>
              ))}
              <Button
                className="mt-4"
                size="lg"
                onClick={() => {
                  setOpen(false);
                  scrollTo("#booking");
                }}
              >
                קבע תור עכשיו
              </Button>
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

function scrollTo(hash: string) {
  document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
}
