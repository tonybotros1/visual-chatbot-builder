import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ChatRuntime } from "@/components/chatbot/ChatRuntime";

export default async function PreviewPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return (
    <main className="runtime-page">
      <Link className="runtime-back" href={`/bots/${botId}/builder`}><ChevronLeft size={17} /> Back to builder</Link>
      <ChatRuntime botId={botId} title="Spaghetti Preview" />
    </main>
  );
}
