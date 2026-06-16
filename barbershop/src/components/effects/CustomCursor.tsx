"use client";

import * as React from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

/**
 * Custom barbershop cursor: a gold ring that trails the pointer plus a tiny
 * scissors glyph. Expands over interactive elements. Only enabled on
 * fine-pointer, non-reduced-motion devices.
 */
export function CustomCursor() {
  const [enabled, setEnabled] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const [hidden, setHidden] = React.useState(true);

  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const ringX = useSpring(x, { stiffness: 350, damping: 28, mass: 0.5 });
  const ringY = useSpring(y, { stiffness: 350, damping: 28, mass: 0.5 });

  React.useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduce) return;

    setEnabled(true);
    document.documentElement.classList.add("cursor-none-lux");

    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setHidden(false);
      const target = e.target as HTMLElement;
      setActive(
        Boolean(
          target.closest(
            'a, button, [role="button"], input, textarea, select, label, .cursor-pointer',
          ),
        ),
      );
    };
    const leave = () => setHidden(true);

    window.addEventListener("mousemove", move);
    document.addEventListener("mouseleave", leave);
    return () => {
      window.removeEventListener("mousemove", move);
      document.removeEventListener("mouseleave", leave);
      document.documentElement.classList.remove("cursor-none-lux");
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70]">
      {/* Outer ring */}
      <motion.div
        style={{ left: ringX, top: ringY }}
        animate={{
          opacity: hidden ? 0 : 1,
          scale: active ? 1.7 : 1,
        }}
        transition={{ duration: 0.2 }}
        className="absolute -translate-x-1/2 -translate-y-1/2"
      >
        <div className="h-9 w-9 rounded-full border border-primary/70" />
      </motion.div>

      {/* Inner dot */}
      <motion.div
        style={{ left: x, top: y }}
        animate={{ opacity: hidden ? 0 : 1, scale: active ? 0 : 1 }}
        className="absolute -translate-x-1/2 -translate-y-1/2"
      >
        <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-glow" />
      </motion.div>
    </div>
  );
}
