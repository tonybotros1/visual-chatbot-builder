"use client";

import { useEffect, useState } from "react";
import { siteBaseUrl } from "@/services/api";
import { getSiteSettings } from "@/services/platform";

/**
 * The address to put in share links and embed snippets: the platform's configured public address when an
 * admin set one, otherwise the address this page was opened with. Starts with the latter so links render at once.
 */
export function usePublicSiteUrl(): string {
  const [base, setBase] = useState("");
  useEffect(() => {
    let cancelled = false;
    setBase(siteBaseUrl());
    getSiteSettings()
      .then((settings) => {
        if (!cancelled && settings.public_url) setBase(settings.public_url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return base;
}
