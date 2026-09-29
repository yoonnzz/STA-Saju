import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/saju/chart";
import { tenGod } from "../lib/saju/structure";
import {
  DAILY_FORTUNE_SCHEMA,
  chartSignature,
  dailyEvidence,
  koreaDate,
  makeDailyFortunePrompt,
  validateDailyFortune,
} from "../lib/saju/daily-fortune";

const input = {
  date: "2005-12-23",
  time: "08:37",
  gender: "male" as const,
  calendar: "solar" as const,
  topic: "general" as const,
};
const chart = calculate(input, 2026);
const date = "2026-09-28";
const evidence = dailyEvidence(chart, date);
const generated = {
  summary: "오늘은 해야 할 일을 하나씩 정리해 보세요.",
  work: "급한 일의 순서를 정하고 첫 번째 일부터 시작해 보세요.",
  money: "필요한 지출인지 잠깐 확인한 뒤 결제해 보세요.",
  relationships: "상대의 말을 끝까지 듣고 내 생각을 전해 보세요.",
  action: "잠들기 전에 내일 할 일 하나를 적어 보세요.",
};

test("한국 날짜는 서울 자정에 바뀌며 연말에도 올바르게 넘어간다", () => {
  assert.equal(koreaDate(new Date("2026-09-27T14:59:59.000Z")), "2026-09-27");
  assert.equal(koreaDate(new Date("2026-09-27T15:00:00.000Z")), "2026-09-28");
  assert.equal(koreaDate(new Date("2026-12-31T15:00:00.000Z")), "2027-01-01");
});

test("일진과 십성은 사주와 한국 날짜에서 계산하고 잘못된 날짜를 거부한다", () => {
  assert.match(evidence.dayPillar, /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/);
  assert.equal(evidence.dayTenGod, tenGod(chart.dayMaster.character, evidence.dayPillar[0]));
  assert.notDeepEqual(dailyEvidence(chart, "2026-09-29"), evidence);
  for (const invalid of ["2026-02-29", "2026-13-01", "2026-00-01", "2026-09-31", "2026-9-28", "invalid"]) {
    assert.throws(() => dailyEvidence(chart, invalid), /invalid daily date/);
  }
  assert.doesNotThrow(() => dailyEvidence(chart, "2028-02-29"));
});

test("사주 서명은 네 기둥이 같으면 같고 기둥이 바뀌면 달라진다", () => {
  const same = calculate({ ...input, time: "08:50" }, 2026);
  assert.equal(chartSignature(chart), chartSignature(same));
  const changed = calculate({ ...input, date: "2005-12-24" }, 2026);
  assert.notEqual(chartSignature(chart), chartSignature(changed));
});

test("Gemini 프롬프트는 계산 근거와 다섯 항목만 요청하고 원본 출생정보를 제외한다", () => {
  const prompt = makeDailyFortunePrompt(chart, date);
  assert.match(prompt, /한국 날짜: 2026-09-28/);
  assert.match(prompt, new RegExp(`오늘 일진: ${evidence.dayPillar}`));
  assert.match(prompt, new RegExp(`십성 관계: ${evidence.dayTenGod}`));
  assert.match(prompt, /사용자 원국 대표 오행 분포/);
  assert.doesNotMatch(prompt, /2005-12-23|08:37|"gender"|"male"|"female"|GEMINI_API_KEY|user_id|access_token/);
  assert.deepEqual(DAILY_FORTUNE_SCHEMA.required, ["summary", "work", "money", "relationships", "action"]);
});

test("다섯 풀이를 검증한 뒤 서버 계산 날짜와 근거를 결합한다", () => {
  assert.deepEqual(validateDailyFortune(generated, chart, date), { date, ...evidence, ...generated });
  assert.equal(validateDailyFortune({ ...generated, summary: `  ${generated.summary}  ` }, chart, date).summary, generated.summary);
});

test("누락과 잘못된 길이, 조작된 계산 근거는 운세로 사용하지 않는다", () => {
  for (const value of [null, [], {}, { ...generated, work: undefined }, { ...generated, money: "짧음" }, { ...generated, action: "가".repeat(301) }]) {
    assert.throws(() => validateDailyFortune(value, chart, date));
  }
  assert.throws(() => validateDailyFortune({ ...generated, date: "2026-09-29" }, chart, date), /invalid daily date/);
  assert.throws(() => validateDailyFortune({ ...generated, dayPillar: "잘못된 일진" }, chart, date), /invalid daily pillar/);
  assert.throws(() => validateDailyFortune({ ...generated, dayTenGod: "잘못된 십성" }, chart, date), /invalid daily ten god/);
});
