import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/saju/chart";
import { loadSharedReading } from "../lib/saju/load-shared-reading";
import { RESULT_CATEGORIES, isResultCategory } from "../lib/saju/result-navigation";
import {
  SHARE_DAYS,
  createShareToken,
  hashShareToken,
  normalizeShareNickname,
  parseSharedReading,
  shareExpiry,
  validShareToken,
} from "../lib/saju/shared-reading";

const reading = {
  summary: "일간과 오행을 살펴보세요.",
  personality: {
    overview: "평소의 반응을 돌아보세요.",
    example: "일상에서 생각을 살펴보세요.",
    strengths: "차분하게 생각할 수 있습니다.",
    cautions: "한 가지만 보고 단정하지 마세요.",
    evidence: ["dayMaster"],
    terms: [{ term: "일간", meaning: "태어난 날의 천간입니다." }],
  },
  career: {
    overview: "일하는 방식을 돌아보세요.",
    example: "여러 활동을 시도해 보세요.",
    evidence: ["elements"],
    terms: [{ term: "오행", meaning: "다섯 가지 상징 요소입니다." }],
  },
  relationships: {
    overview: "관계를 돌아보세요.",
    example: "상대의 이야기를 먼저 들어보세요.",
    evidence: ["dayPillar"],
    terms: [{ term: "일주", meaning: "태어난 날의 기둥입니다." }],
  },
};

function sharedRow() {
  return {
    schema_version: 1,
    reading_created_at: "2026-09-23T00:00:00.000Z",
    chart: calculate({
      date: "2005-12-23",
      time: "08:37",
      gender: "male",
      calendar: "solar",
      topic: "general",
    }),
    reading: structuredClone(reading),
  };
}

test("공유 토큰은 임의의 32바이트이며 해시만 저장할 수 있다", () => {
  const first = createShareToken();
  const second = createShareToken();
  assert.equal(first.token.length, 64);
  assert.match(first.token, /^[0-9a-f]{64}$/);
  assert.notEqual(first.token, second.token);
  assert.equal(first.hash, hashShareToken(first.token));
  assert.notEqual(first.hash, first.token);
  assert.equal(first.hash.length, 64);
  for (const token of ["", "a".repeat(63), "g".repeat(64), "A".repeat(64), "../" + first.token]) {
    assert.equal(validShareToken(token), false);
  }
  assert.equal(validShareToken(first.token), true);
});

test("공유 링크는 생성 시각에서 정확히 30일 뒤 만료된다", () => {
  const now = new Date("2026-09-28T00:00:00.000Z");
  assert.equal(SHARE_DAYS, 30);
  assert.equal(shareExpiry(now), "2026-10-28T00:00:00.000Z");
  assert.equal(new Date(shareExpiry(now)).getTime() - now.getTime(), 30 * 24 * 60 * 60 * 1000);
});

test("공유 별명은 공백을 정리하고 길이 및 제어 문자를 검사한다", () => {
  assert.equal(normalizeShareNickname("  별명  "), "별명");
  assert.equal(normalizeShareNickname("가".repeat(30)), "가".repeat(30));
  for (const value of [null, 3, "", "  ", "가".repeat(31), "a\nadmin", "a\u007fb"]) {
    assert.equal(normalizeShareNickname(value), null);
  }
});

test("공유된 결과는 정상 스냅샷만 읽고 별도 계정 자료를 합치지 않는다", () => {
  const row = sharedRow();
  const parsed = parseSharedReading({
    ...row,
    nickname: "별명",
    user_id: "private-user-id",
    access_token: "private-token",
    date: "2005-12-23",
    time: "08:37",
    gender: "male",
    daily_fortune: { summary: "오늘의 운세" },
  });
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed).sort(), ["chart", "createdAt", "reading", "version"]);
  assert.equal(parsed.reading.summary, row.reading.summary);
  const serialized = JSON.stringify(parsed);
  assert.doesNotMatch(serialized, /private-user-id|private-token|2005-12-23|08:37|daily_fortune|오늘의 운세/);

  row.reading.summary = "나중에 바뀐 풀이";
  assert.notEqual(parsed.reading.summary, row.reading.summary);
});

test("잘못된 공유 스냅샷은 결과로 표시하지 않는다", () => {
  const row = sharedRow();
  assert.equal(parseSharedReading({ ...row, schema_version: 2 }), null);
  assert.equal(parseSharedReading({ ...row, reading_created_at: "invalid" }), null);
  assert.equal(parseSharedReading({ ...row, reading: null }), null);
  assert.equal(parseSharedReading({ ...row, chart: null }), null);
  for (const key of ["date", "time", "gender", "birthDate", "birthTime"]) {
    assert.equal(parseSharedReading({ ...row, chart: { ...row.chart, [key]: "private" } }), null);
  }
});

test("목차의 다섯 카테고리만 개별 페이지 경로로 허용한다", () => {
  assert.deepEqual(RESULT_CATEGORIES.map(({ slug }) => slug), [
    "self", "work-money", "relationships", "life-flow", "shensha",
  ]);
  for (const { slug } of RESULT_CATEGORIES) assert.equal(isResultCategory(slug), true);
  for (const slug of ["", "today", "overview", "../self", "SELF", "self/extra"]) {
    assert.equal(isResultCategory(slug), false);
  }
});

test("익명 공유 조회는 유효한 토큰의 해시와 만료 조건으로만 조회한다", async () => {
  const previous = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secret: process.env.SUPABASE_SECRET_KEY,
    fetch: globalThis.fetch,
  };
  const { token, hash } = createShareToken();
  const requests: URL[] = [];
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-supabase.example";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable";
    process.env.SUPABASE_SECRET_KEY = "test-secret";
    globalThis.fetch = async (input) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      requests.push(url);
      return new Response(JSON.stringify([{ nickname: "별명", expires_at: "2026-10-28T00:00:00.000Z", ...sharedRow() }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    assert.equal(await loadSharedReading("../invalid"), null);
    assert.equal(requests.length, 0);
    const result = await loadSharedReading(token);
    assert.equal(result?.nickname, "별명");
    assert.equal(result?.record.reading.summary, reading.summary);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].pathname, "/rest/v1/saju_shared_readings");
    assert.equal(requests[0].searchParams.get("token_hash"), `eq.${hash}`);
    assert.match(requests[0].searchParams.get("expires_at") ?? "", /^gt\./);
    assert.doesNotMatch(requests[0].toString(), new RegExp(token));
  } finally {
    globalThis.fetch = previous.fetch;
    for (const [name, value] of [
      ["NEXT_PUBLIC_SUPABASE_URL", previous.url],
      ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", previous.key],
      ["SUPABASE_SECRET_KEY", previous.secret],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
