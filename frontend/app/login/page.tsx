"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { login } from "@/services/auth";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";
import { LoginRobot, type RobotMood } from "@/components/brand/LoginRobot";

type Field = "email" | "password" | null;

/** Where the caret sits across the field, -1 (left edge) to 1 (right edge), from the typed text's width. */
function caretPosition(input: HTMLInputElement): number {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return 0;
  const styles = window.getComputedStyle(input);
  context.font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
  const padding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const usable = Math.max(1, input.clientWidth - padding);
  const width = context.measureText(input.value.slice(0, input.selectionStart ?? input.value.length)).width;
  return Math.min(1, Math.max(-1, (width / usable) * 2 - 1));
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused] = useState<Field>(null);
  const [reaction, setReaction] = useState<"sad" | "happy" | null>(null);
  const [lookX, setLookX] = useState(-1);
  const reactionTimer = useRef<number | null>(null);

  useEffect(() => () => { if (reactionTimer.current) window.clearTimeout(reactionTimer.current); }, []);

  // The robot's mood: a reaction wins, then whatever the focused field calls for.
  const mood: RobotMood = reaction
    ?? (focused === "email" ? "typing" : focused === "password" ? (showPassword ? "peek" : "cover") : showPassword && password ? "peek" : "idle");

  const react = (next: "sad" | "happy", holdMs: number) => {
    setReaction(next);
    if (reactionTimer.current) window.clearTimeout(reactionTimer.current);
    reactionTimer.current = window.setTimeout(() => setReaction(null), holdMs);
  };

  const onEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value);
    setLookX(caretPosition(event.target));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      react("happy", 2000);
      // Come back to the page that asked for a sign-in (same-site paths only).
      const next = new URLSearchParams(window.location.search).get("next") ?? "";
      const destination = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      // A short beat so the nod is seen before the dashboard takes over.
      window.setTimeout(() => router.push(destination), 650);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
      react("sad", 1600);
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <LoginRobot mood={mood} lookX={lookX} />
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
              onChange={onEmailChange}
              onFocus={(event) => { setFocused("email"); setLookX(caretPosition(event.target)); }}
              onBlur={() => setFocused((current) => (current === "email" ? null : current))}
              onSelect={(event) => setLookX(caretPosition(event.currentTarget))}
            />
          </label>
          <label htmlFor="login-password">
            Password
            <div className="auth-password-wrap">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="Your password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused((current) => (current === "password" ? null : current))}
              />
              <button
                type="button"
                className="auth-eye-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
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
