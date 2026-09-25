"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { login } from "@/services/auth";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("demo1234");
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
        <div className="brand-mark"><SpaghettiMark size={42} /></div>
        <p className="eyebrow">Spaghetti</p>
        <h1>Welcome back</h1>
        <p>Untangle your conversations. Sign in to build, publish, and review your flows.</p>
        <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="primary-button" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"}</button>
        <small>Demo: demo@example.com / demo1234</small>
        <Link href="/register">Create an account</Link>
      </form>
    </main>
  );
}
