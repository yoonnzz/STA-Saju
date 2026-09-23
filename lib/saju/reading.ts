import type { SajuChart } from "./chart";

export const ELEMENT_ORDER = ["목", "화", "토", "금", "수"] as const;

export const ELEMENT_MEANING: Record<(typeof ELEMENT_ORDER)[number], string> = {
  목: "성장과 시작",
  화: "표현과 활동",
  토: "중심과 조율",
  금: "정리와 원칙",
  수: "탐색과 흐름",
};

export function createReading(chart: SajuChart) {
  const maxCount = Math.max(...ELEMENT_ORDER.map((element) => chart.elements[element]));
  const leadingElements = ELEMENT_ORDER.filter(
    (element) => chart.elements[element] === maxCount,
  );
  const leadingText =
    leadingElements.length === 1
      ? `${leadingElements[0]}(${maxCount}번)`
      : `${leadingElements.join("·")}(각 ${maxCount}번)`;

  return {
    summary: `나를 나타내는 일간은 ${chart.dayMaster.korean}${chart.dayMaster.element}입니다. 네 기둥의 대표 오행 8글자에서 가장 많이 나온 것은 ${leadingText}입니다.`,
    leadingElements,
    maxCount,
    elementRows: ELEMENT_ORDER.map((element) => ({
      element,
      count: chart.elements[element],
      meaning: ELEMENT_MEANING[element],
    })),
  };
}
