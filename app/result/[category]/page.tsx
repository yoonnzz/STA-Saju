import { notFound } from "next/navigation";
import { isResultCategory, RESULT_CATEGORIES } from "../../../lib/saju/result-navigation";
import SajuForm from "../../saju-form";

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!isResultCategory(category)) notFound();
  const title = RESULT_CATEGORIES.find((item) => item.slug === category)?.label;
  return <main><header className="page-header"><p className="eyebrow">내 사주 풀이</p><h1>{title}</h1></header><SajuForm view="category" category={category} /></main>;
}
