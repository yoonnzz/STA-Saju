import { notFound } from "next/navigation";
import { loadSharedReading } from "../../../../lib/saju/load-shared-reading";
import { isResultCategory } from "../../../../lib/saju/result-navigation";
import { SharedResult } from "../../../saju-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function SharedCategoryPage({ params }: { params: Promise<{ token: string; category: string }> }) {
  const { token, category } = await params;
  if (!isResultCategory(category)) notFound();
  const share = await loadSharedReading(token);
  if (!share) notFound();
  return <SharedResult token={token} nickname={share.nickname} record={share.record} category={category} />;
}
