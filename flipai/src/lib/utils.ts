import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Israeli Shekels, e.g. 2850 -> "₪2,850". */
export function formatILS(value: number, opts?: { decimals?: boolean }) {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: opts?.decimals ? 2 : 0,
    minimumFractionDigits: 0,
  }).format(value);
}

/** Plain grouped number, e.g. 2850 -> "2,850". */
export function formatNumber(value: number) {
  return new Intl.NumberFormat("he-IL").format(value);
}

/** Relative Hebrew date, e.g. "לפני 3 ימים". */
export function formatRelativeHe(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  const hours = Math.round(diff / 3600000);
  const days = Math.round(diff / 86400000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דק׳`;
  if (hours < 24) return `לפני ${hours} שע׳`;
  if (days < 30) return `לפני ${days} ${days === 1 ? "יום" : "ימים"}`;
  return d.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Deterministic string hash (used to seed mock AI output reproducibly). */
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded pseudo-random generator (mulberry32). */
export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a deterministic item from an array using a 0..1 value. */
export function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

export function currentPeriod(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Greeting by local hour, in Hebrew. */
export function hebrewGreeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return "לילה טוב";
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
}
