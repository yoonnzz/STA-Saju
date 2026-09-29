import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/saju/chart";
import {
  GEMINI_RESPONSE_SCHEMA,
  makeGeminiPrompt,
  makeShenshaPrompt,
  makeShenshaResponseSchema,
  validateShenshaReading,
  validateGeminiReading,
  type GeminiReading,
} from "../lib/saju/interpretation";
import { parseStoredReading } from "../lib/saju/stored-reading";
import { POST } from "../app/api/reading/route";

const input = {
  date: "2005-12-23",
  time: "08:37",
  gender: "male" as const,
  calendar: "solar" as const,
  topic: "general" as const,
};
const chart = calculate(input, 2026);
const shortReading: GeminiReading = {
  summary: "일간과 대표 오행을 함께 살피면 성향을 읽는 단서가 됩니다.",
  personality: {
    overview: "일간을 바탕으로 자신의 반응 방식을 돌아볼 수 있습니다.",
    example: "예를 들어 친구들과 놀이를 정할 때 각자의 의견을 먼저 들어볼 수 있습니다.",
    strengths: "상황을 차분하게 살피는 강점을 돌아볼 수 있습니다.",
    cautions: "한 가지 해석만으로 성격을 단정하지 않는 편이 좋습니다.",
    evidence: ["dayMaster"],
    terms: [{ term: "일간", meaning: "태어난 날의 천간입니다." }],
  },
  career: {
    overview: "대표 오행 분포를 일과 진로의 질문에 참고할 수 있습니다.",
    example: "예를 들어 학교 과제를 고를 때 여러 활동을 해 보고 재미있는 일을 찾아볼 수 있습니다.",
    evidence: ["elements"],
    terms: [{ term: "오행", meaning: "다섯 가지 상징 요소입니다." }],
  },
  relationships: {
    overview: "네 기둥은 관계를 돌아보는 하나의 참고 자료입니다.",
    example: "예를 들어 친구가 속상해할 때 먼저 무슨 일이 있었는지 물어볼 수 있습니다.",
    evidence: ["dayPillar"],
    terms: [{ term: "일주", meaning: "태어난 날의 기둥입니다." }],
  },
};

const topics = Array.from({ length: 6 }, (_, index) => ({
  title: `주제 ${index + 1}`,
  explanation: "계산 결과를 바탕으로 생각해 볼 수 있는 내용입니다.",
  example: "친구와 의견을 나누는 상황을 떠올릴 수 있습니다.",
  action: "오늘 한 가지 행동을 천천히 실천해 봅니다.",
}));
const period = {
  label: "현재 시기의 참고 주제",
  interpretation: "계산된 흐름을 삶을 돌아보는 자료로 읽습니다.",
  example: "새 취미를 정하기 전에 관심사를 적어 보는 상황입니다.",
  opportunity: "새로운 시도를 선택해 볼 수 있습니다.",
  caution: "결과를 미리 정해 놓고 판단하지 않습니다.",
  action: "작은 계획을 하나 적어 봅니다.",
};
const reading: GeminiReading = {
  ...shortReading,
  personality: { ...shortReading.personality, topics },
  career: { ...shortReading.career, topics },
  relationships: { ...shortReading.relationships, topics },
  lifeFlow: {
    overview: "현재 시기의 흐름을 돌아보는 참고 자료입니다.",
    example: "올해 하고 싶은 활동을 적어 보는 상황을 떠올릴 수 있습니다.",
    evidence: ["daYun", "yearFlow", "monthFlow"],
    terms: [{ term: "대운", meaning: "긴 시간의 흐름을 나타내는 기호입니다." }],
    topics,
    decade: period,
    years: [2026, 2027].map((year) => ({ ...period, year })),
    months: Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      theme: "한 달 동안 돌아볼 주제를 살펴봅니다.",
      advice: "작은 행동 한 가지를 시도해 봅니다.",
    })),
  },
  shensha: {
    overview: "계산된 살과 귀인을 삶을 돌아보는 보조 자료로 읽습니다.",
    items: chart.shensha!.matched.map((item) => ({
      ruleId: item.ruleId,
      name: item.name,
      easyMeaning: "이 상징이 뜻하는 바를 쉬운 말로 살펴봅니다.",
      positiveConditions: "상황을 차분히 살피면 도움이 될 수 있습니다.",
      challengingConditions: "서둘러 단정하면 어려움이 될 수 있습니다.",
      lifeExample: "친구와 의견을 나누는 가상 상황을 떠올릴 수 있습니다.",
      action: "오늘 한 가지 선택을 천천히 해 봅니다.",
      timingNote: "현재 시기에 같은 상징이 나타나는지 살펴봅니다.",
      evidenceRuleIds: [item.ruleId],
    })),
  },
  finalAdvice: {
    summary: "계산 결과를 참고로 자신에게 맞는 행동을 선택합니다.",
    actions: ["오늘 할 일을 하나 정해 봅니다.", "필요한 도움을 물어봅니다.", "하루를 천천히 돌아봅니다."],
  },
};

function request(body: unknown): Request {
  return new Request("http://localhost:3000/api/reading", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body && typeof body === "object" && !Array.isArray(body)
      ? { gender: "male", ...body }
      : body),
  });
}

test("구조화된 세 항목과 계산 근거를 갖춘 해석을 허용한다", () => {
  assert.deepEqual(validateGeminiReading(reading, false, chart), reading);
});

test("계산된 살·귀인 전체와 정확히 같은 ID·이름·근거만 허용한다", () => {
  const items = reading.shensha!.items;
  assert.equal(items.length, chart.shensha!.matched.length);
  assert.deepEqual(validateShenshaReading(reading.shensha, chart), reading.shensha);
  assert.throws(() => validateShenshaReading({ ...reading.shensha, items: items.slice(1) }, chart), /mismatched shensha ids/);
  assert.throws(() => validateShenshaReading({ ...reading.shensha, items: [...items, items[0]] }, chart), /mismatched shensha ids/);
  assert.throws(() => validateShenshaReading({ ...reading.shensha, items: [{ ...items[0], ruleId: "invented_rule", evidenceRuleIds: ["invented_rule"] }, ...items.slice(1)] }, chart), /mismatched shensha ids/);
  assert.throws(() => validateShenshaReading({ ...reading.shensha, items: [{ ...items[0], name: "다른 이름" }, ...items.slice(1)] }, chart), /mismatched shensha name/);
  assert.throws(() => validateShenshaReading({ ...reading.shensha, items: [{ ...items[0], evidenceRuleIds: [items[1].ruleId] }, ...items.slice(1)] }, chart), /invalid shensha evidence ids/);
  assert.throws(() => validateGeminiReading({ ...reading, shensha: { ...reading.shensha, items: items.slice(1) } }, false, chart));
  assert.throws(() => validateGeminiReading({ ...reading, shensha: { ...reading.shensha, items: [...items, items[0]] } }, false, chart));
  assert.throws(() => validateGeminiReading({ ...reading, shensha: { ...reading.shensha, items: [{ ...items[0], ruleId: "invented_rule", evidenceRuleIds: ["invented_rule"] }, ...items.slice(1)] } }, false, chart));
  assert.throws(() => validateGeminiReading({ ...reading, shensha: { ...reading.shensha, items: [{ ...items[0], name: "다른 이름" }, ...items.slice(1)] } }, false, chart));
  assert.throws(() => validateGeminiReading({ ...reading, shensha: { ...reading.shensha, items: [{ ...items[0], evidenceRuleIds: [items[1].ruleId] }, ...items.slice(1)] } }, false, chart));
});

test("새 깊은 해석은 세 카테고리와 2026·2027년, 열두 달, 실천 조언을 모두 요구한다", () => {
  for (const name of ["personality", "career", "relationships"] as const) {
    assert.equal(reading[name].topics?.length, 6);
    assert.throws(() => validateGeminiReading({
      ...reading,
      [name]: { ...reading[name], topics: undefined },
    }, false, chart));
  }
  assert.deepEqual(reading.lifeFlow?.years.map((item) => item.year), [2026, 2027]);
  assert.deepEqual(reading.lifeFlow?.months.map((item) => item.month), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(reading.finalAdvice?.actions.length, 3);
  assert.throws(() => validateGeminiReading({ ...reading, lifeFlow: undefined }, false, chart));
  assert.throws(() => validateGeminiReading({ ...reading, finalAdvice: undefined }, false, chart));
});

test("누락·중복 월운과 기준 연도가 다른 세운을 거부한다", () => {
  const flow = reading.lifeFlow!;
  assert.throws(() => validateGeminiReading({ ...reading, lifeFlow: { ...flow, months: flow.months.slice(0, 11) } }, false, chart));
  assert.throws(() => validateGeminiReading({ ...reading, lifeFlow: { ...flow, months: [...flow.months.slice(0, 11), flow.months[0]] } }, false, chart));
  assert.throws(() => validateGeminiReading({ ...reading, lifeFlow: { ...flow, years: [{ ...flow.years[0], year: 2028 }, flow.years[1]] } }, false, chart));
});

test("필수 항목이나 올바른 계산 근거가 빠진 해석을 거부한다", () => {
  assert.throws(() => validateGeminiReading({ ...reading, career: undefined }));
  assert.throws(() =>
    validateGeminiReading({
      ...reading,
      personality: { ...reading.personality, strengths: undefined },
    }),
  );
  assert.throws(() =>
    validateGeminiReading({
      ...reading,
      relationships: { ...reading.relationships, evidence: [] },
    }),
  );
  assert.throws(() =>
    validateGeminiReading({
      ...reading,
      career: { ...reading.career, evidence: ["birthDate"] },
    }),
  );
});

test("새 Gemini 해석은 세 항목 각각에 가상의 예시가 있어야 한다", () => {
  for (const name of ["personality", "career", "relationships"] as const) {
    assert.throws(() => validateGeminiReading({
      ...reading,
      [name]: { ...reading[name], example: undefined },
    }));
  }
});

test("기본 풀이의 6자 행동 문장은 허용하고 5자 행동 문장은 거부한다", () => {
  const validAction = "천천히 해요";
  const invalidAction = "오늘 해요";
  assert.equal(validAction.length, 6);
  assert.equal(invalidAction.length, 5);
  const withBaseAction = (action: string) => ({
    ...reading,
    personality: {
      ...reading.personality,
      topics: [{ ...topics[0], action }, ...topics.slice(1)],
    },
  });
  assert.equal(validateGeminiReading(withBaseAction(validAction), false, chart).personality.topics?.[0].action, validAction);
  assert.throws(() => validateGeminiReading(withBaseAction(invalidAction), false, chart), /invalid reading length \(5, allowed 6-300\)/);
});

test("살·귀인 풀이의 6자 행동 문장은 허용하고 5자 행동 문장은 거부한다", () => {
  const validAction = "천천히 해요";
  const invalidAction = "오늘 해요";
  assert.equal(validAction.length, 6);
  assert.equal(invalidAction.length, 5);
  const items = reading.shensha!.items;
  const withShenshaAction = (action: string) => ({
    ...reading.shensha,
    items: [{ ...items[0], action }, ...items.slice(1)],
  });
  assert.equal(validateShenshaReading(withShenshaAction(validAction), chart).items[0].action, validAction);
  assert.throws(() => validateShenshaReading(withShenshaAction(invalidAction), chart), /invalid shensha action length \(5, allowed 6-300\)/);
});

test("Gemini 프롬프트에는 계산 근거가 있고 원본 출생 일시가 없다", () => {
  const prompt = makeGeminiPrompt(chart);
  assert.match(prompt, /계산 근거/);
  assert.match(prompt, new RegExp(chart.dayMaster.korean));
  assert.match(prompt, /20~30대/);
  assert.match(prompt, /바로 다음 문장에서 일상적인 뜻/);
  assert.match(prompt, /직장, 이직, 독립, 연애/);
  assert.match(prompt, /깊은 구조 계산/);
  assert.match(prompt, /십성|지장간/);
  assert.match(prompt, /가상 상황/);
  assert.match(prompt, /설명·예시·실천 문장.*공백을 제외하고도 8자 이상/);
  assert.match(prompt, /시기 계산/);
  assert.doesNotMatch(prompt, /초등학생|초등학교 5학년/);
  assert.doesNotMatch(prompt, /2005-12-23|08:37/);
  assert.doesNotMatch(prompt, /"gender"|"male"|"female"/);
  const shenshaPrompt = makeShenshaPrompt(chart);
  assert.match(shenshaPrompt, /20~30대/);
  assert.match(shenshaPrompt, /직장·독립·연애·돈 관리/);
  assert.match(shenshaPrompt, /설명·예시·실천 문장.*공백을 제외하고도 8자 이상/);
  assert.doesNotMatch(shenshaPrompt, /초등학생|2005-12-23|08:37|"gender"/);
});

test("최근 정상 결과만 저장 데이터로 읽고 깨진 데이터와 다른 버전은 거부한다", () => {
  const stored = { version: 1, createdAt: "2026-09-23T00:00:00.000Z", chart, reading };
  assert.deepEqual(parseStoredReading(JSON.stringify(stored)), stored);
  assert.equal(parseStoredReading("{"), null);
  assert.equal(parseStoredReading(JSON.stringify({ ...stored, version: 2 })), null);
  assert.equal(parseStoredReading(JSON.stringify({ ...stored, createdAt: "yesterday" })), null);
  assert.equal(parseStoredReading(JSON.stringify({ ...stored, reading: { ...reading, career: null } })), null);
  assert.equal(parseStoredReading(JSON.stringify({ ...stored, chart: { ...chart, structure: { ...chart.structure, tenGods: [] } } })), null);
  assert.equal(parseStoredReading(JSON.stringify({ ...stored, chart: { ...chart, structure: { ...chart.structure, elementScores: { 목: "many" } } } })), null);
});

test("예시가 없던 이전 버전의 정상 저장 결과도 계속 읽는다", () => {
  const legacyReading = {
    ...shortReading,
    personality: { ...shortReading.personality, example: undefined },
    career: { ...shortReading.career, example: undefined },
    relationships: { ...shortReading.relationships, example: undefined },
  };
  const stored = {
    version: 1,
    createdAt: "2026-09-23T00:00:00.000Z",
    chart: { ...chart, fortune: undefined, shensha: undefined, structure: undefined },
    reading: legacyReading,
  };
  const parsed = parseStoredReading(JSON.stringify(stored));
  assert.ok(parsed);
  assert.equal(parsed.reading.personality.example, undefined);
  assert.equal(parsed.reading.career.example, undefined);
  assert.equal(parsed.reading.relationships.example, undefined);
  assert.equal(parsed.chart.structure, undefined);
});

test("잘못된 출생 입력은 Gemini를 호출하지 않는다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  let calls = 0;
  process.env.GEMINI_API_KEY = "unit-test-key";
  globalThis.fetch = async () => {
    calls++;
    throw new Error("should not call Gemini");
  };
  try {
    const response = await POST(request({ date: "2005-02-30", time: "08:37" }));
    assert.equal(response.status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("성별을 선택하지 않으면 Gemini를 호출하지 않는다", async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("must not call Gemini");
  };
  try {
    const response = await POST(request({ date: input.date, time: input.time, gender: undefined }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /성별/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test("API 키가 없으면 Gemini를 호출하지 않고 설정 오류를 반환한다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  delete process.env.GEMINI_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("should not call Gemini");
  };
  try {
    const response = await POST(request({ date: input.date, time: input.time }));
    assert.equal(response.status, 503);
    assert.equal(calls, 0);
    assert.equal("reading" in (await response.json()), false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("깨진 JSON과 지나치게 긴 요청은 Gemini를 호출하지 않는다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "unit-test-key";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("should not call Gemini");
  };
  try {
    const malformed = await POST(new Request("http://localhost:3000/api/reading", {
      method: "POST",
      body: "{broken-json",
    }));
    assert.equal(malformed.status, 400);
    const oversized = await POST(request({ date: input.date, time: input.time, padding: "x".repeat(1024) }));
    assert.equal(oversized.status, 413);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("서버는 지정 모델에 키 헤더와 계산 결과만 보내고 구조화된 응답을 반환한다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "unit-test-key";
  const requests: Array<{ url: string; options: RequestInit | undefined }> = [];
  globalThis.fetch = async (target, init) => {
    const index = requests.push({ url: String(target), options: init }) - 1;
    const answer = index === 0 ? { ...reading, shensha: undefined } : reading.shensha;
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
  };
  try {
    const response = await POST(request({ date: input.date, time: input.time }));
    assert.equal(response.status, 200);
    assert.equal(requests.length, 2);
    for (const item of requests) {
      assert.match(item.url, /models\/gemini-3\.5-flash-lite:generateContent$/);
      assert.equal((item.options?.headers as Record<string, string>)["x-goog-api-key"], "unit-test-key");
      const sent = JSON.stringify(JSON.parse(String(item.options?.body)));
      assert.doesNotMatch(sent, /2005-12-23|08:37|unit-test-key|"gender"|"male"/);
    }
    const baseBody = JSON.parse(String(requests[0].options?.body));
    const shenshaBody = JSON.parse(String(requests[1].options?.body));
    assert.match(JSON.stringify(baseBody), /계산 근거/);
    assert.match(JSON.stringify(shenshaBody), /살·귀인 계산/);
    assert.equal(baseBody.generationConfig.responseMimeType, "application/json");
    assert.equal(shenshaBody.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(baseBody.generationConfig.responseSchema, GEMINI_RESPONSE_SCHEMA);
    assert.deepEqual(shenshaBody.generationConfig.responseSchema, makeShenshaResponseSchema());
    assert.equal("minItems" in shenshaBody.generationConfig.responseSchema.properties.items, false);
    assert.equal("maxItems" in shenshaBody.generationConfig.responseSchema.properties.items, false);
    assert.equal("enum" in shenshaBody.generationConfig.responseSchema.properties.items.items.properties.ruleId, false);
    assert.deepEqual(shenshaBody.generationConfig.responseSchema.properties.items.items.required, [
      "ruleId", "name", "easyMeaning", "positiveConditions", "challengingConditions",
      "lifeExample", "action", "timingNote", "evidenceRuleIds",
    ]);
    assert.equal("responseFormat" in baseBody.generationConfig, false);
    assert.equal("responseFormat" in shenshaBody.generationConfig, false);
    const result = await response.json();
    assert.deepEqual(result.chart, chart);
    assert.deepEqual(result.reading, reading);
    assert.equal(result.accountSave, "signed_out");
    assert.ok(Number.isFinite(Date.parse(result.createdAt)));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("잘못된 Gemini 응답과 요청 실패는 가짜 해석 없이 오류를 반환한다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "unit-test-key";
  try {
    globalThis.fetch = async () => Response.json({ candidates: [] });
    const malformed = await POST(request({ date: input.date, time: input.time }));
    assert.equal(malformed.status, 502);
    assert.equal("reading" in (await malformed.json()), false);

    for (const name of ["personality", "career", "relationships"] as const) {
      const missingExample = {
        ...reading,
        [name]: { ...reading[name], example: undefined },
      };
      globalThis.fetch = async () => Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(missingExample) }] } }],
      });
      const rejected = await POST(request({ date: input.date, time: input.time }));
      assert.equal(rejected.status, 502);
      assert.equal("reading" in (await rejected.json()), false);
    }

    globalThis.fetch = async () => { throw new Error("network details must stay private"); };
    const failed = await POST(request({ date: input.date, time: input.time }));
    assert.equal(failed.status, 503);
    const payload = await failed.json();
    assert.equal("reading" in payload, false);
    assert.doesNotMatch(JSON.stringify(payload), /network details must stay private/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("두 AI 요청 중 하나라도 실패하면 합쳐진 결과를 반환하지 않는다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  const oldConsoleError = console.error;
  const logs: unknown[][] = [];
  process.env.GEMINI_API_KEY = "unit-test-key";
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    for (const failingIndex of [0, 1]) {
      logs.length = 0;
      let calls = 0;
      globalThis.fetch = async () => {
        const index = calls++;
        if (index === failingIndex) return new Response("PRIVATE_UPSTREAM_ERROR", { status: 503 });
        const answer = index === 0 ? { ...reading, shensha: undefined } : reading.shensha;
        return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
      };
      const response = await POST(request({ date: input.date, time: input.time }));
      assert.equal(calls, 2);
      assert.equal(response.status, 502);
      const payload = await response.json();
      assert.equal("reading" in payload, false);
      assert.equal("accountSave" in payload, false);
      assert.doesNotMatch(JSON.stringify(payload), /PRIVATE_UPSTREAM_ERROR/);
      assert.equal(logs.length, 1);
      assert.equal(logs[0][0], "Gemini request failed");
      assert.equal((logs[0][1] as { source: string }).source, failingIndex === 0 ? "base" : "shensha");
      assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_UPSTREAM_ERROR|unit-test-key/);
    }
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldConsoleError;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("Gemini 인증·사용량·요청 형식 오류는 원문을 숨기고 필요한 조치를 안내한다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "unit-test-key";
  const upstreamSecret = "UPSTREAM_PRIVATE_DIAGNOSTIC";
  const cases = [
    { upstream: 403, expected: 502, message: /API 키.*확인/ },
    { upstream: 429, expected: 503, message: /사용 한도.*다시 시도/ },
    { upstream: 400, expected: 502, message: /요청 형식.*확인/ },
  ];
  try {
    for (const item of cases) {
      globalThis.fetch = async () => new Response(upstreamSecret, { status: item.upstream });
      const response = await POST(request({ date: input.date, time: input.time }));
      assert.equal(response.status, item.expected);
      const payload = await response.json();
      assert.match(payload.error, item.message);
      assert.equal("reading" in payload, false);
      assert.doesNotMatch(JSON.stringify(payload), /UPSTREAM_PRIVATE_DIAGNOSTIC|unit-test-key/);
    }
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("Gemini 실패 로그는 허용된 상태 코드와 제한된 오류 코드만 기록한다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  const oldConsoleError = console.error;
  const logs: unknown[][] = [];
  process.env.GEMINI_API_KEY = "unit-test-key";
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    globalThis.fetch = async () => Response.json({
      error: {
        status: "PERMISSION_DENIED",
        message: "API key invalid: unit-test-key",
        details: [{ reason: "API_KEY_INVALID", metadata: { key: "UPSTREAM_PRIVATE_DIAGNOSTIC" } }],
      },
    }, { status: 403 });
    const response = await POST(request({ date: input.date, time: input.time }));
    assert.equal(response.status, 502);
    assert.equal(logs.length, 2);
    for (const [index, [label, details]] of logs.entries()) {
      assert.equal(label, "Gemini request failed");
      assert.deepEqual(details, {
        source: index === 0 ? "base" : "shensha",
        status: 403, code: "PERMISSION_DENIED", reason: "API_KEY_INVALID", category: "api_key",
        diagnostic: "API key invalid: [redacted]",
      });
    }
    assert.doesNotMatch(JSON.stringify(logs), /UPSTREAM_PRIVATE_DIAGNOSTIC|unit-test-key/);

    logs.length = 0;
    globalThis.fetch = async () => Response.json({
      error: { status: "BAD CODE WITH SECRET", details: [{ reason: "PRIVATE VALUE 123" }] },
    }, { status: 400 });
    await POST(request({ date: input.date, time: input.time }));
    assert.equal(logs.length, 2);
    for (const [index, [, details]] of logs.entries()) {
      assert.deepEqual(details, { source: index === 0 ? "base" : "shensha", status: 400, code: "unknown", reason: "unknown", category: "unknown", diagnostic: "" });
    }
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldConsoleError;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("Gemini 오류 메시지는 네 가지 범주로만 분류하고 원문을 로그에 남기지 않는다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  const oldConsoleError = console.error;
  const logs: unknown[][] = [];
  process.env.GEMINI_API_KEY = "unit-test-key";
  console.error = (...args: unknown[]) => { logs.push(args); };
  const cases = [
    { message: "API key invalid", category: "api_key" },
    { message: "Invalid JSON payload in request body", category: "request_schema" },
    { message: "Free tier unavailable in this region", category: "availability" },
    { message: "Unexpected vendor response", category: "unknown" },
  ];
  try {
    for (const item of cases) {
      logs.length = 0;
      globalThis.fetch = async () => Response.json({
        error: { status: "BAD_REQUEST", message: item.message, details: [{ reason: "UPSTREAM_REASON" }] },
      }, { status: 400 });
      const response = await POST(request({ date: input.date, time: input.time }));
      assert.equal(response.status, 502);
      assert.equal(logs.length, 2);
      for (const [index, [label, details]] of logs.entries()) {
        assert.equal(label, "Gemini request failed");
        assert.deepEqual(details, {
          source: index === 0 ? "base" : "shensha",
          status: 400, code: "BAD_REQUEST", reason: "UPSTREAM_REASON", category: item.category,
          diagnostic: item.message,
        });
      }
      assert.doesNotMatch(JSON.stringify(logs), /unit-test-key/);
      assert.doesNotMatch(JSON.stringify(await response.json()), /unit-test-key/);
    }
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldConsoleError;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("400 오류 진단은 API 키와 날짜를 가리고 240자로 제한하며 기존 안내를 유지한다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  const oldConsoleError = console.error;
  const logs: unknown[][] = [];
  const anotherKey = `AIza${"X".repeat(35)}`;
  process.env.GEMINI_API_KEY = "unit-test-key";
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    globalThis.fetch = async () => Response.json({
      error: {
        status: "INVALID_ARGUMENT",
        message: `Invalid JSON payload in request body. key=unit-test-key other=${anotherKey} date=2005-12-23 ${"detail ".repeat(100)}`,
      },
    }, { status: 400 });
    const response = await POST(request({ date: input.date, time: input.time }));
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /Gemini 요청 형식을 처리하지 못했습니다/);
    assert.equal(logs.length, 2);
    for (const [label, value] of logs) {
      assert.equal(label, "Gemini request failed");
      const details = value as { status: number; category: string; diagnostic: string };
      assert.equal(details.status, 400);
      assert.equal(details.category, "request_schema");
      assert.ok(details.diagnostic.length <= 240);
      assert.match(details.diagnostic, /\[redacted\]/);
      assert.match(details.diagnostic, /\[date\]/);
      assert.doesNotMatch(details.diagnostic, /unit-test-key|AIza|2005-12-23/);
    }
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldConsoleError;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("Gemini 오류의 details가 배열이 아니어도 안내 응답을 반환한다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  const oldConsoleError = console.error;
  process.env.GEMINI_API_KEY = "unit-test-key";
  console.error = () => {};
  try {
    globalThis.fetch = async () => Response.json({
      error: { status: "BAD_REQUEST", details: { reason: "unexpected object" } },
    }, { status: 400 });
    const response = await POST(request({ date: input.date, time: input.time }));
    assert.equal(response.status, 502);
    assert.match((await response.json()).error, /요청 형식/);
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldConsoleError;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("검증 실패 로그는 단계와 살·귀인 필드명만 기록하고 풀이 원문을 숨긴다", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  const oldFetch = globalThis.fetch;
  const oldConsoleError = console.error;
  const logs: unknown[][] = [];
  const privateReadingText = "PRIVATE_READING_TEXT".repeat(30);
  process.env.GEMINI_API_KEY = "unit-test-key";
  console.error = (...args: unknown[]) => { logs.push(args); };
  const cases = [
    {
      phase: "base",
      base: { ...reading, summary: "짧음", shensha: undefined },
      shensha: reading.shensha,
      label: "invalid reading length (2, allowed 6-500)",
    },
    {
      phase: "shensha",
      base: { ...reading, shensha: undefined },
      shensha: { ...reading.shensha, items: [
        { ...reading.shensha!.items[0], easyMeaning: privateReadingText },
        ...reading.shensha!.items.slice(1),
      ] },
      label: `invalid shensha easyMeaning length (${privateReadingText.length}, allowed 6-400)`,
    },
    {
      phase: "combined",
      base: shortReading,
      shensha: reading.shensha,
      label: "invalid reading topics",
    },
  ];
  try {
    for (const item of cases) {
      logs.length = 0;
      let calls = 0;
      globalThis.fetch = async () => Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(calls++ === 0 ? item.base : item.shensha) }] } }],
      });
      const response = await POST(request({ date: input.date, time: input.time }));
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /AI 해석 형식을 확인하지 못했습니다/);
      assert.deepEqual(logs, [[`Gemini ${item.phase} validation failed:`, item.label]]);
      assert.doesNotMatch(JSON.stringify(logs), /PRIVATE_READING_TEXT|unit-test-key|2005-12-23|08:37/);
      if (item.phase !== "combined") {
        assert.match(String(logs[0][1]), /length \(\d+, allowed \d+-\d+\)/);
      }
    }
  } finally {
    globalThis.fetch = oldFetch;
    console.error = oldConsoleError;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});
