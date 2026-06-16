"use client";

import { motion } from "framer-motion";
import { ChevronDown, Star, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HairLines } from "@/components/effects/HairLines";
import { AnimatedScissors } from "@/components/effects/AnimatedScissors";
import { site } from "@/lib/site";

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] as const },
  },
};

function scrollTo(hash: string) {
  document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
}

export function Hero() {
  return (
    <section
      id="hero"
      className="grain relative flex min-h-[100svh] items-center overflow-hidden"
    >
      {/* Background layers */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_-10%,#17171b_0%,#0c0c0e_55%,#070708_100%)]" />
      <div className="absolute inset-0 bg-radial-fade" />
      <HairLines className="opacity-70" count={26} opacity={0.45} />
      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_50%,transparent_30%,rgba(0,0,0,0.7)_100%)]" />

      <div className="container-edge relative z-10 py-28">
        <motion.div
          variants={container}
          initial="hidden"
          animate="visible"
          className="mx-auto flex max-w-4xl flex-col items-center text-center"
        >
          <motion.div variants={item}>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium tracking-wide text-primary">
              <Star className="size-3.5 fill-primary" />
              דירוג 4.9 מבית אלפי לקוחות
            </span>
          </motion.div>

          <motion.div variants={item} className="my-6">
            <AnimatedScissors className="mx-auto h-14 w-14" />
          </motion.div>

          <motion.h1
            variants={item}
            className="font-display text-5xl font-bold leading-[1.05] text-balance sm:text-6xl md:text-7xl lg:text-8xl"
          >
            <span className="block">{site.slogan}</span>
            <span className="mt-2 block text-gold-shimmer">
              במדויק. בסטייל. ביוקרה.
            </span>
          </motion.h1>

          <motion.p
            variants={item}
            className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            {site.description}
          </motion.p>

          <motion.div
            variants={item}
            className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
          >
            <Button size="lg" onClick={() => scrollTo("#booking")}>
              <Calendar className="size-5" />
              קבע תור עכשיו
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => scrollTo("#services")}
            >
              גלה את השירותים
            </Button>
          </motion.div>

          {/* Stats */}
          <motion.dl
            variants={item}
            className="mt-16 grid w-full max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4"
          >
            {site.stats.map((stat) => (
              <div key={stat.label} className="flex flex-col items-center">
                <dt className="sr-only">{stat.label}</dt>
                <dd className="font-display text-3xl font-bold text-gold-gradient sm:text-4xl">
                  {stat.value}
                </dd>
                <span className="mt-1 text-xs text-muted-foreground sm:text-sm">
                  {stat.label}
                </span>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.button
        type="button"
        onClick={() => scrollTo("#about")}
        aria-label="גלול למטה"
        className="absolute inset-x-0 bottom-8 z-10 mx-auto flex w-fit flex-col items-center gap-2 text-muted-foreground"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <span className="text-[10px] uppercase tracking-[0.3em]">גלול</span>
        <ChevronDown className="size-5 text-primary" />
      </motion.button>
    </section>
  );
}
