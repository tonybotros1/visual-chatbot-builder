import { BuilderWorkspace } from "@/components/flow/BuilderWorkspace";

export default async function BuilderPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return <BuilderWorkspace botId={botId} />;
}

