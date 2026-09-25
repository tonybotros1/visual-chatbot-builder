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
        <div className="brand-mark"><SpaghettiMark size={42} /></div>
        <p className="eyebrow">Spaghetti</p>
        <h1>Create your account</h1>
        <label>Name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <div className="form-error">{error}</div> : null}
        <button className="primary-button" disabled={busy} type="submit">{busy ? "Creating…" : "Create account"}</button>
        <Link href="/login">Already have an account? Sign in</Link>
      </form>
    </main>
  );
}
