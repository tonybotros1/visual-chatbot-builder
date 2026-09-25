import { LocalizationWorkspace } from "@/components/localization/LocalizationWorkspace";

export default async function LocalizationPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params;
  return <LocalizationWorkspace botId={botId} />;
}
