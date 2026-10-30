"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { register } from "@/services/auth";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register(name, email, password);
      router.push("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Registration failed");
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
          <h1>Create your account</h1>
          <p>Start building conversational flows in minutes.</p>
        </header>

        <div className="auth-fields">
          <label htmlFor="register-name">
            Name
            <input
              id="register-name"
              name="name"
              autoComplete="name"
              autoFocus
              placeholder="Your name"
              required
              minLength={2}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label htmlFor="register-email">
            Email
            <input
              id="register-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label htmlFor="register-password">
            Password
            <input
              id="register-password"
              type="password"
              name="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </div>

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <button className="primary-button auth-submit" disabled={busy} type="submit">
          {busy ? "Creating..." : "Create account"}
        </button>

        <footer className="auth-footer">
          <span>Already have an account?</span>
          <Link href="/login">Sign in</Link>
        </footer>
      </form>
    </main>
  );
}
