import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/saju/chart";
import {
  makeGeminiPrompt,
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
  finalAdvice: {
    summary: "계산 결과를 참고로 자신에게 맞는 행동을 선택합니다.",
    actions: ["오늘 할 일을 하나 정해 봅니다.", "필요한 도움을 물어봅니다.", "하루를 천천히 돌아봅니다."],
  },
};

function request(body: unknown): Request {
  return new Request("http://localhost:3000/api/reading", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("구조화된 세 항목과 계산 근거를 갖춘 해석을 허용한다", () => {
  assert.deepEqual(validateGeminiReading(reading, false, chart), reading);
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

test("Gemini 프롬프트에는 계산 근거가 있고 원본 출생 일시가 없다", () => {
  const prompt = makeGeminiPrompt(chart);
  assert.match(prompt, /계산 근거/);
  assert.match(prompt, new RegExp(chart.dayMaster.korean));
  assert.match(prompt, /초등학생도 이해할 수/);
  assert.match(prompt, /가상 상황 하나/);
  assert.doesNotMatch(prompt, /2005-12-23|08:37/);
});

test("최근 정상 결과만 저장 데이터로 읽고 깨진 데이터와 다른 버전은 거부한다", () => {
  const stored = { version: 1, createdAt: "2026-09-23T00:00:00.000Z", chart, reading };
  assert.deepEqual(parseStoredReading(JSON.stringify(stored)), stored);
  assert.equal(parseStoredReading("{"), null);
  assert.equal(parseStoredReading(JSON.stringify({ ...stored, version: 2 })), null);
  assert.equal(parseStoredReading(JSON.stringify({ ...stored, createdAt: "yesterday" })), null);
  assert.equal(parseStoredReading(JSON.stringify({ ...stored, reading: { ...reading, career: null } })), null);
});

test("예시가 없던 이전 버전의 정상 저장 결과도 계속 읽는다", () => {
  const legacyReading = {
    ...reading,
    personality: { ...reading.personality, example: undefined },
    career: { ...reading.career, example: undefined },
    relationships: { ...reading.relationships, example: undefined },
  };
  const stored = {
    version: 1,
    createdAt: "2026-09-23T00:00:00.000Z",
    chart,
    reading: legacyReading,
  };
  const parsed = parseStoredReading(JSON.stringify(stored));
  assert.ok(parsed);
  assert.equal(parsed.reading.personality.example, undefined);
  assert.equal(parsed.reading.career.example, undefined);
  assert.equal(parsed.reading.relationships.example, undefined);
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
  let url = "";
  let options: RequestInit | undefined;
  globalThis.fetch = async (target, init) => {
    url = String(target);
    options = init;
    return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(reading) }] } }] });
  };
  try {
    const response = await POST(request({ date: input.date, time: input.time }));
    assert.equal(response.status, 200);
    assert.match(url, /models\/gemini-3\.5-flash-lite:generateContent$/);
    assert.equal((options?.headers as Record<string, string>)["x-goog-api-key"], "unit-test-key");
    const sent = JSON.stringify(JSON.parse(String(options?.body)));
    assert.match(sent, /계산 근거/);
    assert.doesNotMatch(sent, /2005-12-23|08:37|unit-test-key/);
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
