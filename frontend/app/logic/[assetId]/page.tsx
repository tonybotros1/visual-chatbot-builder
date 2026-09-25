import { LogicWorkspace } from "@/components/logic/LogicWorkspace";


export default async function LogicPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return <LogicWorkspace assetId={assetId} />;
}
