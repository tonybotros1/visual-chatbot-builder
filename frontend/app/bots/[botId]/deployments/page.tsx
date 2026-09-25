import { DeploymentWorkspace } from "@/components/deployments/DeploymentWorkspace";

export default async function DeploymentsPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return <DeploymentWorkspace botId={botId} />;
}
