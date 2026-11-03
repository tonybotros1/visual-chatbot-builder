"use client";

import { useEffect } from "react";
import { getBranding } from "@/services/branding";
import type { BrandingRecord } from "@/types/api";

/** Last branding seen in this browser, applied before the API answers so colours never flash. */
const CACHE_KEY = "spaghetti:branding";

export const defaultBranding: BrandingRecord = { primary_color: "#00A1B0", secondary_color: "#7C3AED" };

/** Push the platform colours into the CSS variables every stylesheet derives from. */
export function applyBranding(branding: BrandingRecord) {
  const root = document.documentElement.style;
  root.setProperty("--brand-primary", branding.primary_color);
  root.setProperty("--brand-secondary", branding.secondary_color);
}

export function rememberBranding(branding: BrandingRecord) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(branding));
  } catch {
    // Storage unavailable: the colours still apply for this page.
  }
}

export function cachedBranding(): BrandingRecord | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BrandingRecord>;
    if (typeof parsed.primary_color !== "string" || typeof parsed.secondary_color !== "string") return null;
    return { primary_color: parsed.primary_color, secondary_color: parsed.secondary_color };
  } catch {
    return null;
  }
}

/** Mounted once in the root layout: applies cached colours at once, then the live ones from the API. */
export function BrandingProvider() {
  useEffect(() => {
    const cached = cachedBranding();
    if (cached) applyBranding(cached);
    getBranding()
      .then((branding) => {
        applyBranding(branding);
        rememberBranding(branding);
      })
      .catch(() => {
        // Offline or API down: keep the cached or default colours.
      });
  }, []);
  return null;
}
