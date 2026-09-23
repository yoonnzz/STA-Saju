import type { SajuChart } from "./chart";

export const EVIDENCE_KEYS = [
  "dayMaster",
  "yearPillar",
  "monthPillar",
  "dayPillar",
  "timePillar",
  "elements",
  "daYun",
  "yearFlow",
  "monthFlow",
] as const;

export type EvidenceKey = (typeof EVIDENCE_KEYS)[number];
export type Term = { term: string; meaning: string };
export type ReadingTopic = {
  title: string;
  explanation: string;
  example: string;
  action: string;
};
export type ReadingSection = {
  overview: string;
  example?: string;
  evidence: EvidenceKey[];
  terms: Term[];
  topics?: ReadingTopic[];
};
export type PeriodReading = {
  label: string;
  interpretation: string;
  example: string;
  opportunity: string;
  caution: string;
  action: string;
};
export type LifeFlowReading = ReadingSection & {
  decade: PeriodReading;
  years: Array<PeriodReading & { year: number }>;
  months: Array<{ month: number; theme: string; advice: string }>;
};
export type GeminiReading = {
  summary: string;
  personality: ReadingSection & { strengths: string; cautions: string };
  career: ReadingSection;
  relationships: ReadingSection;
  lifeFlow?: LifeFlowReading;
  finalAdvice?: { summary: string; actions: string[] };
};

const evidenceSet = new Set<string>(EVIDENCE_KEYS);

export function evidenceLabels(chart: SajuChart): Record<EvidenceKey, string> {
  return {
    dayMaster: `일간 ${chart.dayMaster.korean}(${chart.dayMaster.character}), 대표 오행 ${chart.dayMaster.element}`,
    yearPillar: `년주 ${chart.pillars[0].korean}(${chart.pillars[0].text})`,
    monthPillar: `월주 ${chart.pillars[1].korean}(${chart.pillars[1].text})`,
    dayPillar: `일주 ${chart.pillars[2].korean}(${chart.pillars[2].text})`,
    timePillar: `시주 ${chart.pillars[3].korean}(${chart.pillars[3].text})`,
    elements: `대표 오행: ${Object.entries(chart.elements)
      .map(([name, count]) => `${name} ${count}`)
      .join(" · ")}`,
    daYun: chart.fortune
      ? `대운 ${chart.fortune.direction}, 시작까지 ${chart.fortune.start.year}년 ${chart.fortune.start.month}개월, 현재 구간 ${chart.fortune.decades.find((item) => item.current)?.ganZhi || "확인 불가"}`
      : "대운 계산 없음",
    yearFlow: chart.fortune
      ? chart.fortune.years.map((item) => `${item.year}년 ${item.ganZhi}`).join(" · ")
      : "세운 계산 없음",
    monthFlow: chart.fortune
      ? chart.fortune.months.map((item) => `${item.month}월 ${item.ganZhi}`).join(" · ")
      : "월운 계산 없음",
  };
}

function text(value: unknown, max = 600, min = 8): string {
  if (typeof value !== "string") throw new Error("invalid reading text");
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new Error("invalid reading length");
  }
  return trimmed;
}

function readingTopic(value: unknown): ReadingTopic {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid reading topic");
  }
  const data = value as Record<string, unknown>;
  return {
    title: text(data.title, 80, 2),
    explanation: text(data.explanation, 700),
    example: text(data.example, 400),
    action: text(data.action, 300),
  };
}

function section(value: unknown, allowLegacy: boolean): ReadingSection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid reading section");
  }
  const data = value as Record<string, unknown>;
  if (
    !Array.isArray(data.evidence) ||
    data.evidence.length < 1 ||
    data.evidence.length > 4 ||
    !data.evidence.every((item) => typeof item === "string" && evidenceSet.has(item))
  ) {
    throw new Error("invalid evidence");
  }
  if (!Array.isArray(data.terms) || data.terms.length < 1 || data.terms.length > 4) {
    throw new Error("invalid terms");
  }
  return {
    overview: text(data.overview),
    ...(data.example === undefined && allowLegacy
      ? {}
      : { example: text(data.example, 400) }),
    evidence: [...new Set(data.evidence)] as EvidenceKey[],
    terms: data.terms.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("invalid term");
      }
      const term = item as Record<string, unknown>;
      return { term: text(term.term, 60, 1), meaning: text(term.meaning, 160, 3) };
    }),
    ...(data.topics === undefined && allowLegacy
      ? {}
      : {
          topics: (() => {
            if (!Array.isArray(data.topics) || data.topics.length !== 6) {
              throw new Error("invalid reading topics");
            }
            return data.topics.map(readingTopic);
          })(),
        }),
  };
}

function period(value: unknown): PeriodReading {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid period reading");
  }
  const data = value as Record<string, unknown>;
  return {
    label: text(data.label, 100, 2),
    interpretation: text(data.interpretation, 700),
    example: text(data.example, 400),
    opportunity: text(data.opportunity, 400),
    caution: text(data.caution, 400),
    action: text(data.action, 300),
  };
}

function lifeFlow(value: unknown, chart?: SajuChart): LifeFlowReading {
  const base = section(value, true);
  const data = value as Record<string, unknown>;
  if (!Array.isArray(data.years) || data.years.length !== 2) {
    throw new Error("invalid yearly flow");
  }
  if (!Array.isArray(data.months) || data.months.length !== 12) {
    throw new Error("invalid monthly flow");
  }
  const years = data.years.map((item) => {
    const result = period(item);
    const year = Number((item as Record<string, unknown>).year);
    if (!Number.isInteger(year)) throw new Error("invalid flow year");
    return { ...result, year };
  });
  const months = data.months.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("invalid monthly reading");
    }
    const month = Number((item as Record<string, unknown>).month);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new Error("invalid flow month");
    }
    return {
      month,
      theme: text((item as Record<string, unknown>).theme, 240),
      advice: text((item as Record<string, unknown>).advice, 240),
    };
  });
  if (new Set(months.map((item) => item.month)).size !== 12) {
    throw new Error("duplicate flow month");
  }
  if (chart?.fortune) {
    const expectedYears = chart.fortune.years.map((item) => item.year);
    if (years.some((item, index) => item.year !== expectedYears[index])) {
      throw new Error("mismatched flow year");
    }
  }
  return { ...base, decade: period(data.decade), years, months };
}

export function validateGeminiReading(
  value: unknown,
  allowLegacy = false,
  chart?: SajuChart,
): GeminiReading {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid reading");
  }
  const data = value as Record<string, unknown>;
  const personality = section(data.personality, allowLegacy);
  const personalityInput = data.personality as Record<string, unknown>;
  const result: GeminiReading = {
    summary: text(data.summary, 500),
    personality: {
      ...personality,
      strengths: text(personalityInput.strengths, 400),
      cautions: text(personalityInput.cautions, 400),
    },
    career: section(data.career, allowLegacy),
    relationships: section(data.relationships, allowLegacy),
  };
  if (data.lifeFlow === undefined && allowLegacy) return result;
  const final = data.finalAdvice as Record<string, unknown>;
  if (!final || !Array.isArray(final.actions) || final.actions.length !== 3) {
    throw new Error("invalid final advice");
  }
  return {
    ...result,
    lifeFlow: lifeFlow(data.lifeFlow, chart),
    finalAdvice: {
      summary: text(final.summary, 500),
      actions: final.actions.map((item) => text(item, 240)),
    },
  };
}

const termSchema = {
  type: "object",
  properties: {
    term: { type: "string" },
    meaning: { type: "string" },
  },
  required: ["term", "meaning"],
};
const sectionSchema = {
  type: "object",
  properties: {
    overview: { type: "string" },
    example: { type: "string" },
    evidence: { type: "array", items: { type: "string", enum: EVIDENCE_KEYS } },
    terms: { type: "array", items: termSchema },
    topics: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          explanation: { type: "string" },
          example: { type: "string" },
          action: { type: "string" },
        },
        required: ["title", "explanation", "example", "action"],
      },
    },
  },
  required: ["overview", "example", "evidence", "terms", "topics"],
};

const periodSchema = {
  type: "object",
  properties: {
    label: { type: "string" },
    interpretation: { type: "string" },
    example: { type: "string" },
    opportunity: { type: "string" },
    caution: { type: "string" },
    action: { type: "string" },
  },
  required: ["label", "interpretation", "example", "opportunity", "caution", "action"],
};

export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    personality: {
      type: "object",
      properties: {
        ...sectionSchema.properties,
        strengths: { type: "string" },
        cautions: { type: "string" },
      },
      required: [...sectionSchema.required, "strengths", "cautions"],
    },
    career: sectionSchema,
    relationships: sectionSchema,
    lifeFlow: {
      type: "object",
      properties: {
        overview: { type: "string" },
        example: { type: "string" },
        evidence: { type: "array", items: { type: "string", enum: EVIDENCE_KEYS } },
        terms: { type: "array", items: termSchema },
        decade: periodSchema,
        years: {
          type: "array",
          minItems: 2,
          maxItems: 2,
          items: {
            type: "object",
            properties: { ...periodSchema.properties, year: { type: "integer" } },
            required: [...periodSchema.required, "year"],
          },
        },
        months: {
          type: "array",
          minItems: 12,
          maxItems: 12,
          items: {
            type: "object",
            properties: {
              month: { type: "integer" },
              theme: { type: "string" },
              advice: { type: "string" },
            },
            required: ["month", "theme", "advice"],
          },
        },
      },
      required: ["overview", "example", "evidence", "terms", "decade", "years", "months"],
    },
    finalAdvice: {
      type: "object",
      properties: {
        summary: { type: "string" },
        actions: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
      },
      required: ["summary", "actions"],
    },
  },
  required: ["summary", "personality", "career", "relationships", "lifeFlow", "finalAdvice"],
};

export function makeGeminiPrompt(chart: SajuChart): string {
  return [
    "당신은 사주 계산기가 아니라 초등학생도 이해할 수 있게 말하는 쉬운 한국어 설명 작성자입니다.",
    "아래 제공된 계산 결과만 사용해 JSON 스키마에 맞는 해석을 작성하세요.",
    "핵심 요약은 짧고 쉬운 2~3문장으로 작성하세요. personality는 나 자신, career는 일과 돈, relationships는 사랑과 관계를 뜻합니다.",
    "초등학교 5학년에게 이야기하듯 한 문장에 한 가지 생각만 담고, 짧은 문장을 쓰세요. 어려운 사주 용어는 '일간(태어난 날의 첫 글자)'처럼 바로 풀어주세요.",
    "personality topics에는 기본 성향, 생각과 결정, 감정 표현, 강점과 재능, 주의점, 스트레스 회복을 넣으세요.",
    "career topics에는 업무 방식, 좋은 환경, 공부와 성장, 협업, 소비와 저축, 주의점을 넣으세요.",
    "relationships topics에는 애정 표현, 관계의 가치, 가까워지는 방식, 갈등 반응, 소통 방법, 주의점을 넣으세요.",
    "각 topic의 example에는 친구, 학교, 취미, 일처럼 익숙한 가상 상황을 적고 action에는 해볼 수 있는 작은 행동을 적으세요.",
    "lifeFlow의 decade는 현재 대운, years는 제공된 두 해 순서, months는 1월부터 12월 순서로 모두 작성하세요. decade와 years의 example에도 일상적인 가상 상황을 넣으세요.",
    "시기 흐름은 실제 사건을 예언하지 말고 그 시기에 돌아볼 주제와 선택 가능한 행동으로 설명하세요.",
    "성향 항목의 strengths와 cautions는 각각 다른 내용으로 작성하세요.",
    "각 항목의 evidence에는 아래 근거 키를 1~3개만 선택하고, terms에는 사용한 사주 용어의 쉬운 뜻을 1~2개 넣으세요.",
    "계산 결과 밖의 사실을 지어내지 말고, 오행 횟수를 사주의 강약이나 미래 예언으로 확정하지 마세요.",
    "건강·법률·재정 판단을 지시하거나 직업·관계의 결과를 보장하지 마세요.",
    `계산 근거(JSON): ${JSON.stringify(evidenceLabels(chart))}`,
    `시기 계산(JSON): ${JSON.stringify(chart.fortune)}`,
    `계산 방식: ${chart.method}. ${chart.elementMethod}`,
  ].join("\n");
}
