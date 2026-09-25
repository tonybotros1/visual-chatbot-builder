import { ChatRuntime } from "@/components/chatbot/ChatRuntime";

export default async function PublicChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ botSlug: string }>;
  searchParams: Promise<{ deployment?: string; eligibility?: string; lang?: string }>;
}) {
  const { botSlug } = await params;
  const { deployment, eligibility, lang } = await searchParams;
  return <main className="runtime-page"><ChatRuntime identifier={botSlug} deploymentKey={deployment} eligibilityToken={eligibility} locale={lang} title="Spaghetti Chat" /></main>;
}
