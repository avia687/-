import type { BusinessConfig, Terminology } from "@/lib/business/types";
import { getTemplate } from "@/lib/business/templates";
import { parseJSON } from "@/lib/utils";

// A minimal shape of BusinessProfile the resolver needs — keeps this usable
// from both server (Prisma rows) and client (serialized props).
export type ResolvableProfile = {
  businessType?: string | null;
  name?: string | null;
  terminologyOverrides?: string | null;
  aiInstructions?: string | null;
};

/**
 * Resolves the effective config for a tenant: template defaults with the
 * tenant's terminology overrides and AI instructions layered on top. This is
 * the single source of truth every screen reads from — no code branches on
 * business type directly.
 */
export function resolveConfig(profile: ResolvableProfile | null): BusinessConfig {
  const base = getTemplate(profile?.businessType);
  if (!profile) return base;

  const overrides = parseJSON<Partial<Terminology>>(profile.terminologyOverrides, {});
  return {
    ...base,
    label: profile.businessType && !getTemplate(profile.businessType) ? base.label : base.label,
    terminology: { ...base.terminology, ...overrides },
    aiInstructions: profile.aiInstructions || base.aiInstructions,
  };
}

/** Convenience: get a single term with a safe fallback. */
export function term(config: BusinessConfig, key: keyof Terminology): string {
  return config.terminology[key];
}
