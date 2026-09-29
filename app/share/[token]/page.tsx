import { notFound } from "next/navigation";
import { loadSharedReading } from "../../../lib/saju/load-shared-reading";
import { SharedResult } from "../../saju-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function SharedOverviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const share = await loadSharedReading(token);
  if (!share) notFound();
  return <SharedResult token={token} nickname={share.nickname} record={share.record} />;
}
