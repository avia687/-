"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Expand, X } from "lucide-react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { Reveal } from "@/components/effects/Reveal";
import { BeforeAfter } from "@/components/shared/BeforeAfter";
import { cn } from "@/lib/utils";
import { gallery, galleryCategories } from "@/data/gallery";
import type { GalleryCategory, GalleryItem } from "@/lib/types";

export function Gallery() {
  const [filter, setFilter] = React.useState<GalleryCategory | "all">("all");
  const [active, setActive] = React.useState<GalleryItem | null>(null);

  const items = React.useMemo(
    () => (filter === "all" ? gallery : gallery.filter((g) => g.category === filter)),
    [filter],
  );

  // Close lightbox on Escape
  React.useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setActive(null);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);

  return (
    <section id="gallery" className="relative py-24 md:py-32">
      <div className="container-edge">
        <SectionHeading
          eyebrow="הגלריה"
          title={
            <>
              לפני <span className="text-gold-gradient">ואחרי</span>
            </>
          }
          description="גררו את המחוון כדי לגלות את ההבדל. כל תספורת היא טרנספורמציה."
        />

        {/* Filters */}
        <Reveal className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
          {galleryCategories.map((cat) => {
            const isActive = filter === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setFilter(cat.id)}
                aria-pressed={isActive}
                className={cn(
                  "rounded-full border px-5 py-2 text-sm font-medium transition-all duration-300",
                  isActive
                    ? "border-transparent bg-gold-gradient text-primary-foreground shadow-gold"
                    : "border-white/10 text-foreground/70 hover:border-primary/40 hover:text-foreground",
                )}
              >
                {cat.label}
              </button>
            );
          })}
        </Reveal>

        {/* Grid */}
        <motion.div
          layout
          className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {items.map((item) => (
              <motion.figure
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="group relative"
              >
                <BeforeAfter
                  before={item.before}
                  after={item.after}
                  alt={item.title}
                  className="aspect-[4/5]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <figcaption className="mt-3 flex items-center justify-between">
                  <span className="font-display text-sm font-medium">
                    {item.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActive(item)}
                    className="flex items-center gap-1.5 text-xs text-primary transition-opacity hover:opacity-80"
                    aria-label={`הגדל את ${item.title}`}
                  >
                    <Expand className="size-3.5" />
                    הגדל
                  </button>
                </figcaption>
              </motion.figure>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {active ? (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`גלריה: ${active.title}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setActive(null)}
            className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-4 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl"
            >
              <button
                type="button"
                onClick={() => setActive(null)}
                aria-label="סגור"
                className="absolute -top-12 right-0 grid size-10 place-items-center rounded-full border border-white/15 text-white transition-colors hover:border-primary hover:text-primary"
              >
                <X className="size-5" />
              </button>
              <BeforeAfter
                before={active.before}
                after={active.after}
                alt={active.title}
                className="aspect-[4/5] sm:aspect-square"
                sizes="(max-width: 768px) 100vw, 640px"
              />
              <p className="mt-4 text-center font-display text-lg">
                {active.title}
              </p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
