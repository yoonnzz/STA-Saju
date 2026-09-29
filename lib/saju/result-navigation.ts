export const RESULT_CATEGORIES = [
  { slug: "self", label: "나 자신", description: "기본 성향과 나를 이해하는 방법" },
  { slug: "work-money", label: "일과 돈", description: "일하는 방식과 돈을 다루는 태도" },
  { slug: "relationships", label: "사랑과 관계", description: "가까운 관계와 소통 방식" },
  { slug: "life-flow", label: "삶의 흐름", description: "대운·세운·월운의 흐름" },
  { slug: "shensha", label: "살·귀인", description: "발견된 전통 상징과 활용" },
] as const;

export type ResultCategory = (typeof RESULT_CATEGORIES)[number]["slug"];

export function isResultCategory(value: string): value is ResultCategory {
  return RESULT_CATEGORIES.some((item) => item.slug === value);
}
