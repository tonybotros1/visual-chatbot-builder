import { SubflowWorkspace } from "@/components/subflows/SubflowWorkspace";


export default async function SubflowBuilderPage({
  params,
}: {
  params: Promise<{ subflowId: string }>;
}) {
  const { subflowId } = await params;
  return <SubflowWorkspace subflowId={subflowId} />;
}
