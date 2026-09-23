import { CALCULATION, type SajuChart } from "./chart";
import { validateGeminiReading, type GeminiReading } from "./interpretation";
import { SHENSHA_CATALOG_VERSION, SHENSHA_RULES } from "./shensha";
import { TEN_GOD_NAMES } from "./structure";

export const STORED_READING_KEY = "saju-reading-v1";

export type StoredReading = {
  version: 1;
  createdAt: string;
  chart: SajuChart;
  reading: GeminiReading;
};

function validChart(value: unknown): value is SajuChart {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const chart = value as Partial<SajuChart>;
  if (
    !Array.isArray(chart.pillars) ||
    chart.pillars.length !== 4 ||
    !chart.pillars.every(
      (pillar) =>
        pillar &&
        typeof pillar.text === "string" &&
        typeof pillar.korean === "string" &&
        typeof pillar.label === "string",
    ) ||
    !chart.dayMaster ||
    typeof chart.dayMaster.korean !== "string" ||
    typeof chart.dayMaster.element !== "string" ||
    typeof chart.dayMaster.character !== "string" ||
    !chart.elements ||
    chart.method !== CALCULATION ||
    typeof chart.elementMethod !== "string"
  ) return false;
  const counts = ["목", "화", "토", "금", "수"].map(
    (name) => chart.elements?.[name as keyof SajuChart["elements"]],
  );
  if (!counts.every((n): n is number =>
    typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 8
  )) return false;
  if (counts.reduce((sum, n) => sum + n, 0) !== 8) return false;
  if (chart.fortune !== undefined) {
    const fortune = chart.fortune;
    if (
      !Number.isInteger(fortune.referenceYear) ||
      !["순행", "역행"].includes(fortune.direction) ||
      !fortune.start ||
      ![fortune.start.year, fortune.start.month, fortune.start.day, fortune.start.hour]
        .every((item) => Number.isInteger(item) && item >= 0) ||
      !Array.isArray(fortune.decades) ||
      !fortune.decades.some((item) => item.current) ||
      !Array.isArray(fortune.years) || fortune.years.length !== 2 ||
      !Array.isArray(fortune.months) || fortune.months.length !== 12 ||
      typeof fortune.method !== "string"
    ) return false;
  }
  if (chart.shensha !== undefined) {
    const ids = new Set(SHENSHA_RULES.map((rule) => rule.id));
    const result = chart.shensha;
    if (
      result.catalogVersion !== SHENSHA_CATALOG_VERSION ||
      result.checkedCount !== SHENSHA_RULES.length ||
      !Array.isArray(result.matched) ||
      new Set(result.matched.map((item) => item.ruleId)).size !== result.matched.length ||
      !result.matched.every((item) =>
        ids.has(item.ruleId) &&
        typeof item.name === "string" &&
        ["helper", "caution", "mixed"].includes(item.polarity) &&
        ["cross_checked", "method_difference", "partial"].includes(item.sourceStatus) &&
        Array.isArray(item.hits) && item.hits.length > 0 &&
        item.hits.every((hit) => Array.isArray(hit.pillars) && typeof hit.via === "string") &&
        item.timing &&
        [item.timing.currentDecade, item.timing.currentYear, item.timing.nextYear]
          .every((hits) => Array.isArray(hits) && hits.every((hit) => Array.isArray(hit.pillars) && typeof hit.via === "string"))
      )
    ) return false;
  }
  if (chart.structure !== undefined) {
    const structure = chart.structure;
    const allowedTenGods = new Set<string>([...TEN_GOD_NAMES, "일간"]);
    if (
      !Array.isArray(structure.tenGods) || structure.tenGods.length !== 4 ||
      !structure.tenGods.every((item) =>
        typeof item.pillar === "string" && typeof item.stem === "string" &&
        allowedTenGods.has(item.stemTenGod) && Array.isArray(item.hidden) &&
        item.hidden.every((hidden) => typeof hidden.stem === "string" && TEN_GOD_NAMES.includes(hidden.tenGod) && typeof hidden.role === "string")
      ) ||
      !Array.isArray(structure.relations) ||
      !structure.relations.every((item) => Array.isArray(item.pillars) && item.pillars.length === 2 && Array.isArray(item.characters) && item.characters.length === 2) ||
      !structure.season || typeof structure.season.name !== "string" || typeof structure.season.centralElement !== "string" ||
      !structure.elementScores || !Object.values(structure.elementScores).every((score) => typeof score === "number" && Number.isFinite(score) && score >= 0) ||
      typeof structure.method !== "string"
    ) return false;
  }
  return true;
}

export function parseStoredReading(raw: string | null): StoredReading | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (
      record.version !== 1 ||
      typeof record.createdAt !== "string" ||
      !Number.isFinite(Date.parse(record.createdAt)) ||
      !validChart(record.chart)
    ) return null;
    return {
      version: 1,
      createdAt: record.createdAt,
      chart: record.chart,
      reading: validateGeminiReading(record.reading, true, record.chart),
    };
  } catch {
    return null;
  }
}
