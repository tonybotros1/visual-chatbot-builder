import { IntegrationWorkspace } from "@/components/integrations/IntegrationWorkspace";

export default async function IntegrationsPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return <IntegrationWorkspace botId={botId} />;
}
