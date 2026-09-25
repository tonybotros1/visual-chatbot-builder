import { TeamWorkspace } from "@/components/team/TeamWorkspace";

export default async function TeamPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return <TeamWorkspace botId={botId} />;
}
