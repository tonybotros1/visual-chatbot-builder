import { apiFetch, clearToken, setToken } from "./api";
import type { AuthResponse, User } from "@/types/api";

export async function login(email: string, password: string) {
  const response = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(response.access_token);
  return response;
}

export async function register(name: string, email: string, password: string) {
  const response = await apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  setToken(response.access_token);
  return response;
}

/** Whether this server lets visitors create their own account (false on the hosted server). */
export async function registrationOpen(): Promise<boolean> {
  try {
    const options = await apiFetch<{ registration_open: boolean }>("/auth/options");
    return options.registration_open !== false;
  } catch {
    return true;
  }
}

export function logout() {
  clearToken();
}

export function currentUser() {
  return apiFetch<User>("/auth/me");
}

