import { apiFetch } from "./api";
import type { BrandingRecord } from "@/types/api";

export const getBranding = () => apiFetch<BrandingRecord>("/branding");
export const updateBranding = (branding: BrandingRecord) =>
  apiFetch<BrandingRecord>("/branding", { method: "PUT", body: JSON.stringify(branding) });
