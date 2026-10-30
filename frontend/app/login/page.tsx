"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/services/auth";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <header className="auth-header">
          <div className="auth-brand-row">
            <div className="auth-brand">
              <SpaghettiMark size={34} />
              <span>Spaghetti</span>
            </div>
            <img className="auth-partner-logo" src="/manzil-logo.png" alt="Manzil Healthcare Services" width={1703} height={707} />
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to build, publish, and review your flows.</p>
        </header>

        <div className="auth-fields">
          <label htmlFor="login-email">
            Email
            <input
              id="login-email"
              type="email"
              name="email"
              autoComplete="email"
              autoFocus
              placeholder="you@company.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label htmlFor="login-password">
            Password
            <input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Your password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </div>

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <button className="primary-button auth-submit" disabled={busy} type="submit">
          {busy ? "Signing in..." : "Sign in"}
        </button>

        <footer className="auth-footer">
          <span>New to Spaghetti?</span>
          <Link href="/register">Create an account</Link>
        </footer>
      </form>
    </main>
  );
}
