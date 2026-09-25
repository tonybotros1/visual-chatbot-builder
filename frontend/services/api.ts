const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";
const tokenKey = "visual-chatbot-builder:token";

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
  const response = await fetch(`${apiUrl}${path}`, { ...options, headers, cache: "no-store" });
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

