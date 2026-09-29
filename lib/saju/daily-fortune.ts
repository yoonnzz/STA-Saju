import lunar from "lunar-javascript";
import type { SajuChart } from "./chart";
import { tenGod } from "./structure";

const { Solar } = lunar;

export type DailyFortune = {
  date: string;
  dayPillar: string;
  dayTenGod: string;
  summary: string;
  work: string;
  money: string;
  relationships: string;
  action: string;
};

export const DAILY_FORTUNE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    work: { type: "string" },
    money: { type: "string" },
    relationships: { type: "string" },
    action: { type: "string" },
  },
  required: ["summary", "work", "money", "relationships", "action"],
};

export function koreaDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function chartSignature(chart: SajuChart): string {
  return chart.pillars.map((pillar) => pillar.text).join("");
}

export function dailyEvidence(chart: SajuChart, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid daily date");
  const [year, month, day] = date.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.toISOString().slice(0, 10) !== date) throw new Error("invalid daily date");
  const dayPillar = Solar.fromYmdHms(year, month, day, 12, 0, 0)
    .getLunar().getEightChar().getDay();
  const dayTenGod = tenGod(chart.dayMaster.character, dayPillar[0]);
  return { dayPillar, dayTenGod };
}

export function makeDailyFortunePrompt(chart: SajuChart, date: string): string {
  const { dayPillar, dayTenGod } = dailyEvidence(chart, date);
  return [
    "당신은 계산된 사주 자료를 쉬운 한국어 생활 문장으로 설명합니다. 간지나 십성을 새로 계산하지 마세요.",
    "운세는 미래를 확정하는 예언이 아니라 전통적 상징을 활용한 자기 점검 제안입니다.",
    "JSON으로 한 줄 요약(summary), 일(work), 돈(money), 관계(relationships), 오늘 할 작은 행동(action)을 작성하세요.",
    "각 항목은 한국어 한두 문장으로 구체적이고 서로 겹치지 않게 쓰세요. 점수·행운의 색·의료·법률·투자 지시는 쓰지 마세요.",
    "제공한 근거 밖의 개인 사실이나 특정 사건을 지어내지 마세요. 좋고 나쁨을 단정하지 마세요.",
    `한국 날짜: ${date}`,
    `오늘 일진: ${dayPillar}`,
    `사용자 일간: ${chart.dayMaster.character}(${chart.dayMaster.korean}, ${chart.dayMaster.element})`,
    `오늘 천간과 사용자 일간의 십성 관계: ${dayTenGod}`,
    `사용자 원국 대표 오행 분포: ${JSON.stringify(chart.elements)}`,
  ].join("\n");
}

export function validateDailyFortune(value: unknown, chart: SajuChart, date: string): DailyFortune {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid daily fortune");
  const result = value as Record<string, unknown>;
  const fields = ["summary", "work", "money", "relationships", "action"] as const;
  const text = {} as Record<(typeof fields)[number], string>;
  for (const field of fields) {
    if (typeof result[field] !== "string") throw new Error(`invalid ${field}`);
    const trimmed = result[field].trim();
    if (trimmed.length < 8 || trimmed.length > 300) throw new Error(`invalid ${field}`);
    text[field] = trimmed;
  }
  const evidence = dailyEvidence(chart, date);
  if (result.date !== undefined && result.date !== date) throw new Error("invalid daily date");
  if (result.dayPillar !== undefined && result.dayPillar !== evidence.dayPillar) throw new Error("invalid daily pillar");
  if (result.dayTenGod !== undefined && result.dayTenGod !== evidence.dayTenGod) throw new Error("invalid daily ten god");
  return { date, ...evidence, ...text };
}
