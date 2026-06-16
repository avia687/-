"use client";

import * as React from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

type Direction = "up" | "down" | "left" | "right" | "scale" | "fade";

const offset = 36;

function variantsFor(direction: Direction): Variants {
  const hidden: Record<string, number> = { opacity: 0 };
  if (direction === "up") hidden.y = offset;
  if (direction === "down") hidden.y = -offset;
  if (direction === "left") hidden.x = offset;
  if (direction === "right") hidden.x = -offset;
  if (direction === "scale") hidden.scale = 0.9;

  return {
    hidden,
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
    },
  };
}

interface RevealProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: Direction;
  delay?: number;
  once?: boolean;
  as?: "div" | "section" | "li" | "span";
}

export function Reveal({
  children,
  className,
  direction = "up",
  delay = 0,
  once = true,
  ...props
}: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: "-80px" });
  const variants = React.useMemo(() => variantsFor(direction), [direction]);

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      variants={variants}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      transition={{ delay }}
      {...(props as object)}
    >
      {children}
    </motion.div>
  );
}

/** Container that staggers the reveal of its <Reveal> / motion children. */
export function RevealGroup({
  children,
  className,
  stagger = 0.12,
  once = true,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  once?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: stagger } },
      }}
    >
      {children}
    </motion.div>
  );
}

export const revealItem: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};
