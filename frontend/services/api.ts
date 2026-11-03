const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const tokenKey = "visual-chatbot-builder:token";

const isLoopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";

/**
 * The configured URLs default to localhost, which only works on the machine running Docker. When the
 * page itself was opened through another address (a LAN IP or a hostname), point the API and public links
 * at that same address so other computers on the network can use the app without any extra configuration.
 */
function followPageHost(configured: string): string {
  if (typeof window === "undefined") return configured;
  try {
    const url = new URL(configured);
    const pageHost = window.location.hostname;
    if (isLoopback(url.hostname) && !isLoopback(pageHost)) {
      url.hostname = pageHost;
      return url.toString().replace(/\/$/, "");
    }
    return configured;
  } catch {
    return configured;
  }
}

/** Base URL of the API (ends with /api, no trailing slash). */
export const apiBaseUrl = () => followPageHost(configuredApiUrl);
/** Base URL of this site, for public chat links and embeds (no trailing slash). */
export const siteBaseUrl = () => followPageHost(configuredSiteUrl);

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: unknown,
  ) {
    super(message);
  }
}

export function getToken() {
  return typeof window === "undefined" ? null : window.localStorage.getItem(tokenKey);
}

export function setToken(token: string) {
  window.localStorage.setItem(tokenKey, token);
}

export function clearToken() {
  window.localStorage.removeItem(tokenKey);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBaseUrl()}${path}`, { ...options, headers, cache: "no-store" });
  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    const message =
      typeof detail === "object" && detail && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

