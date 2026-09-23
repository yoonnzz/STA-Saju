import { CALCULATION, type SajuChart } from "./chart";
import { validateGeminiReading, type GeminiReading } from "./interpretation";

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
      reading: validateGeminiReading(record.reading, true),
    };
  } catch {
    return null;
  }
}
