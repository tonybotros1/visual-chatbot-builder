import { QualityWorkspace } from "@/components/quality/QualityWorkspace";


export default async function QualityPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return <QualityWorkspace botId={botId} />;
}
