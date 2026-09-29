import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculate } from "../lib/saju/chart";
import { chartSignature, dailyEvidence } from "../lib/saju/daily-fortune";
import { DailyFortuneError, ensureDailyFortune } from "../lib/saju/daily-fortune-service";

const date = "2026-09-28";
const userId = "verified-user";
const chart = calculate({ date: "2005-12-23", time: "08:37", gender: "male", calendar: "solar", topic: "general" }, 2026);
const reading = {
  summary: "일간과 오행 분포를 함께 돌아보는 참고 자료입니다.",
  personality: {
    overview: "일간을 바탕으로 자신의 반응을 돌아볼 수 있습니다.",
    example: "친구와 의견을 나눌 때 자신을 살펴볼 수 있습니다.",
    strengths: "차분히 생각하는 강점을 돌아볼 수 있습니다.",
    cautions: "한 가지 해석만으로 성격을 단정하지 않습니다.",
    evidence: ["dayMaster"],
    terms: [{ term: "일간", meaning: "태어난 날의 천간입니다." }],
  },
  career: {
    overview: "오행 분포를 일과 진로의 질문에 참고할 수 있습니다.",
    example: "활동을 시도한 뒤 흥미를 찾아볼 수 있습니다.",
    evidence: ["elements"],
    terms: [{ term: "오행", meaning: "다섯 가지 상징 요소입니다." }],
  },
  relationships: {
    overview: "네 기둥을 관계에 관한 참고 자료로 읽을 수 있습니다.",
    example: "친구의 이야기를 먼저 들어볼 수 있습니다.",
    evidence: ["dayPillar"],
    terms: [{ term: "일주", meaning: "태어난 날의 기둥입니다." }],
  },
};
const readingRow = { chart, reading, schema_version: 1, reading_created_at: "2026-09-23T00:00:00.000Z" };
const generated = {
  summary: "오늘은 해야 할 일을 하나씩 정리해 보세요.",
  work: "급한 일의 순서를 정하고 첫 번째 일부터 시작해 보세요.",
  money: "필요한 지출인지 잠깐 확인한 뒤 결제해 보세요.",
  relationships: "상대의 말을 끝까지 듣고 내 생각을 전해 보세요.",
  action: "잠들기 전에 내일 할 일 하나를 적어 보세요.",
};
const fortune = { date, ...dailyEvidence(chart, date), ...generated };

type Outcome = { data: unknown; error: null | { message: string } };
function fakeSupabase(options: {
  reading?: Outcome;
  saved?: Outcome;
  stored?: Outcome;
} = {}) {
  const calls: Array<{ table: string; column: string; value: unknown }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const outcomes: Record<string, Outcome> = {
    saju_readings: options.reading ?? { data: readingRow, error: null },
    saju_daily_fortunes: options.saved ?? { data: null, error: null },
  };
  const client = {
    from(table: string) {
      let deleting = false;
      return {
        select() { return this; },
        delete() { deleting = true; return this; },
        eq(column: string, value: unknown) {
          calls.push({ table, column, value });
          return deleting ? Promise.resolve({ error: null }) : this;
        },
        async maybeSingle() { return outcomes[table]; },
      };
    },
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return options.stored ?? { data: fortune, error: null };
    },
  };
  return { client: client as unknown as SupabaseClient, calls, rpcCalls };
}

async function expectError(run: () => Promise<unknown>, status: number, message: RegExp) {
  await assert.rejects(run, (error: unknown) => error instanceof DailyFortuneError && error.status === status && message.test(error.message));
}

test("저장된 같은 날짜·같은 사주의 운세는 Gemini와 저장 호출 없이 재사용한다", async () => {
  const db = fakeSupabase({ saved: { data: { fortune, fortune_date: date, chart_signature: chartSignature(chart) }, error: null } });
  const result = await ensureDailyFortune(db.client, userId, date);
  assert.deepEqual(result, { fortune, cached: true });
  assert.deepEqual(db.rpcCalls, []);
  assert.deepEqual(db.calls.filter((call) => call.column === "user_id").map((call) => call.value), [userId, userId]);
});

test("사주가 없거나 저장된 운세가 손상되면 성공 결과를 만들지 않는다", async () => {
  const missing = fakeSupabase({ reading: { data: null, error: null } });
  await expectError(() => ensureDailyFortune(missing.client, userId, date), 404, /먼저 사주 해석/);
  const damaged = fakeSupabase({ saved: { data: { fortune: { ...fortune, work: "짧음" }, fortune_date: date, chart_signature: chartSignature(chart) }, error: null } });
  await expectError(() => ensureDailyFortune(damaged.client, userId, date), 422, /형식/);
  assert.deepEqual(damaged.rpcCalls, []);
});

test("새 운세는 Gemini 응답을 검증하고 사용자·날짜·사주 서명으로 저장한다", async (context) => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  context.after(() => { if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; });
  const fetchMock = context.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], "test-key");
    const body = JSON.stringify(init?.body);
    assert.doesNotMatch(body, /2005-12-23|08:37|"gender"|"male"|"female"|verified-user/);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(generated) }] } }] }), { status: 200 });
  });
  const db = fakeSupabase();
  assert.deepEqual(await ensureDailyFortune(db.client, userId, date), { fortune, cached: false });
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(db.rpcCalls.length, 1);
  assert.equal(db.rpcCalls[0].name, "save_saju_daily_fortune");
  assert.deepEqual(db.rpcCalls[0].args, {
    p_user_id: userId,
    p_fortune_date: date,
    p_chart_signature: chartSignature(chart),
    p_source_created_at: readingRow.reading_created_at,
    p_fortune: fortune,
  });
});

test("Gemini 응답 형식 오류는 저장하지 않고 실패로 보고한다", async (context) => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  context.after(() => { if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; });
  context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...generated, work: "짧음" }) }] } }] }), { status: 200 }));
  const invalid = fakeSupabase();
  await expectError(() => ensureDailyFortune(invalid.client, userId, date), 502, /형식/);
  assert.deepEqual(invalid.rpcCalls, []);
});

test("다른 날짜나 바뀐 사주 서명은 저장된 운세를 재사용하지 않는다", async (context) => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  context.after(() => { if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(generated) }] } }],
  }), { status: 200 }));
  const yesterday = fakeSupabase({ saved: { data: { fortune, fortune_date: "2026-09-27", chart_signature: chartSignature(chart) }, error: null } });
  assert.equal((await ensureDailyFortune(yesterday.client, userId, date)).cached, false);
  const changed = fakeSupabase({ saved: { data: { fortune, fortune_date: date, chart_signature: "old-chart" }, error: null } });
  assert.equal((await ensureDailyFortune(changed.client, userId, date)).cached, false);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("Gemini 한도와 계정 변경, 저장 오류는 각각 명시적 실패로 처리한다", async (context) => {
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-key";
  context.after(() => { if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey; });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 429 }));
  await expectError(() => ensureDailyFortune(fakeSupabase().client, userId, date), 503, /사용 한도/);
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(generated) }] } }],
  }), { status: 200 }));
  const changed = fakeSupabase({ stored: { data: null, error: { message: "source reading changed" } } });
  await expectError(() => ensureDailyFortune(changed.client, userId, date), 409, /사주 결과가 변경/);
  const failed = fakeSupabase({ stored: { data: null, error: { message: "database unavailable" } } });
  await expectError(() => ensureDailyFortune(failed.client, userId, date), 503, /저장하지 못했습니다/);
  const malformed = fakeSupabase({ stored: { data: { ...fortune, summary: "짧음" }, error: null } });
  await expectError(() => ensureDailyFortune(malformed.client, userId, date), 422, /형식/);
});
