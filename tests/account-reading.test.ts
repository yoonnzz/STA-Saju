import test from "node:test";
import assert from "node:assert/strict";
import { calculate } from "../lib/saju/chart";
import {
  parseReadingRow,
  readingUpsert,
  safeNextPath,
} from "../lib/saju/account-reading";
import type { StoredReading } from "../lib/saju/stored-reading";
import { GET as authCallback } from "../app/auth/callback/route";

const record: StoredReading = {
  version: 1,
  createdAt: "2026-09-23T00:00:00.000Z",
  chart: calculate({
    date: "2005-12-23",
    time: "08:37",
    gender: "male",
    calendar: "solar",
    topic: "general",
  }),
  reading: {
    summary: "일간과 오행 분포는 자신을 돌아보는 참고 자료입니다.",
    personality: {
      overview: "일간을 통해 평소 반응을 돌아볼 수 있습니다.",
      example: "친구와 활동을 고를 때 자신의 생각을 살펴볼 수 있습니다.",
      strengths: "차분히 생각하는 방식을 돌아볼 수 있습니다.",
      cautions: "한 가지만 보고 성격을 단정하지 않습니다.",
      evidence: ["dayMaster"],
      terms: [{ term: "일간", meaning: "태어난 날의 천간입니다." }],
    },
    career: {
      overview: "오행 분포를 일과 진로의 질문에 참고할 수 있습니다.",
      example: "여러 활동을 시도한 뒤 흥미를 찾아볼 수 있습니다.",
      evidence: ["elements"],
      terms: [{ term: "오행", meaning: "다섯 가지 상징 요소입니다." }],
    },
    relationships: {
      overview: "네 기둥을 관계에 관한 참고 자료로 읽을 수 있습니다.",
      example: "친구 이야기를 먼저 듣는 상황을 떠올릴 수 있습니다.",
      evidence: ["dayPillar"],
      terms: [{ term: "일주", meaning: "태어난 날의 기둥입니다." }],
    },
  },
};

const row = {
  chart: record.chart,
  reading: record.reading,
  schema_version: record.version,
  reading_created_at: record.createdAt,
};

test("DB 행에서 지원하는 버전의 정상 결과를 복원한다", () => {
  assert.deepEqual(parseReadingRow(row), record);
});

test("잘못된 DB 행과 지원하지 않는 버전은 결과로 표시하지 않는다", () => {
  for (const value of [
    null,
    [],
    { ...row, schema_version: 2 },
    { ...row, reading_created_at: "invalid date" },
    { ...row, chart: { ...row.chart, elements: { 목: 8, 화: 8, 토: 0, 금: 0, 수: 0 } } },
    { ...row, reading: { ...row.reading, career: null } },
  ]) {
    assert.equal(parseReadingRow(value), null);
  }
});

test("저장 내용에는 확인된 사용자 ID와 결과에 필요한 항목만 담는다", () => {
  const payload = readingUpsert(record, "verified-user-id");
  assert.deepEqual(payload, { user_id: "verified-user-id", ...row });
  assert.deepEqual(Object.keys(payload).sort(), [
    "chart", "reading", "reading_created_at", "schema_version", "user_id",
  ]);
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /2005-12-23|08:37|GEMINI_API_KEY|access_token/);
});

test("로그인 후 이동 주소는 서비스 안의 경로만 허용한다", () => {
  assert.equal(safeNextPath(null), "/");
  assert.equal(safeNextPath("/"), "/");
  assert.equal(safeNextPath("/readings?view=latest"), "/readings?view=latest");
  assert.equal(safeNextPath("https://evil.example/"), "/");
  assert.equal(safeNextPath("//evil.example/"), "/");
  assert.equal(safeNextPath("/\\evil.example/"), "/");
});

test("인증 코드가 없으면 로그인 실패 안내 경로로 돌아간다", async () => {
  const response = await authCallback(new Request("http://localhost:3000/auth/callback?next=%2Freadings"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "http://localhost:3000/?login=failed");
});
