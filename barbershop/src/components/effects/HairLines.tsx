"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface HairLinesProps {
  className?: string;
  /** Number of flowing strands. */
  count?: number;
  /** Base opacity of the strands. */
  opacity?: number;
}

/**
 * Animated "flowing hair" strands rendered on a canvas. The strands drift
 * horizontally on sine waves and gently bend toward the pointer, evoking
 * fine strands of hair. Lightweight and pauses when off-screen / reduced
 * motion is requested.
 */
export function HairLines({
  className,
  count = 22,
  opacity = 0.5,
}: HairLinesProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: 0.5, y: 0.5, active: false };
    let raf = 0;
    let t = 0;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      width = parent.clientWidth;
      height = parent.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const strands = Array.from({ length: count }, (_, i) => ({
      base: (i + 0.5) / count,
      amp: 14 + Math.random() * 40,
      freq: 0.6 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
      speed: 0.15 + Math.random() * 0.4,
      thickness: 0.4 + Math.random() * 1.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const mx = mouse.x * width;
      const my = mouse.y * height;

      for (const s of strands) {
        ctx.beginPath();
        const yBase = s.base * height;
        const steps = 36;
        for (let i = 0; i <= steps; i++) {
          const px = (i / steps) * width;
          let py =
            yBase +
            Math.sin((i / steps) * Math.PI * 2 * s.freq + s.phase + t * s.speed) *
              s.amp;

          if (mouse.active) {
            const dx = px - mx;
            const dy = py - my;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const radius = 180;
            if (dist < radius) {
              const force = (1 - dist / radius) * 40;
              py += (dy / (dist || 1)) * force;
            }
          }
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        const o = opacity * (0.25 + s.base * 0.75);
        ctx.strokeStyle = `rgba(217, 168, 63, ${o.toFixed(3)})`;
        ctx.lineWidth = s.thickness;
        ctx.stroke();
      }

      if (!reduce) t += 0.016;
      raf = requestAnimationFrame(draw);
    };

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - rect.left) / rect.width;
      mouse.y = (e.clientY - rect.top) / rect.height;
      mouse.active = true;
    };
    const onLeave = () => (mouse.active = false);

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
    };
  }, [count, opacity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
