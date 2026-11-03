"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ChatRuntime } from "@/components/chatbot/ChatRuntime";
import { SpaghettiMark } from "@/components/brand/SpaghettiMark";
import { apiBaseUrl } from "@/services/api";

type Target = { slug: string; name: string };

/** Short share link: resolves the code to a published bot and opens its full-page chat. */
export default function ShortLinkPage() {
  const params = useParams<{ code: string }>();
  const [target, setTarget] = useState<Target | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBaseUrl()}/public/r/${encodeURIComponent(params.code)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("not active");
        return (await response.json()) as Target;
      })
      .then((resolved) => {
        if (!cancelled) setTarget(resolved);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.code]);

  if (failed) {
    return (
      <main className="runtime-page">
        <section className="chat-shell chat-shell-loading" aria-live="polite">
          <div className="chat-loading-content">
            <SpaghettiMark size={38} />
            <strong>This link is not active</strong>
            <span>The chatbot may be unpublished or the link may have been typed incorrectly.</span>
          </div>
        </section>
      </main>
    );
  }

  if (!target) {
    return (
      <main className="runtime-page">
        <section className="chat-shell chat-shell-loading" aria-busy="true" aria-live="polite">
          <div className="chat-loading-content">
            <SpaghettiMark size={38} />
            <strong>Opening chat…</strong>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="runtime-page">
      <ChatRuntime identifier={target.slug} title={target.name} />
    </main>
  );
}
