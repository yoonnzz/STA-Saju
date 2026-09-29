import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { calculate } from "../lib/saju/chart";

// The route receives the same Request/Response objects as HTTP, with the two
// Supabase client factories replaced before the route module is loaded.
const requireModule = createRequire(import.meta.url);
const serverPath = requireModule.resolve("../lib/supabase/server.ts");
const adminPath = requireModule.resolve("../lib/supabase/admin.ts");
requireModule(serverPath);
requireModule(adminPath);
let serverClient: unknown;
let adminClient: unknown;
requireModule.cache[serverPath]!.exports = { createSupabaseServerClient: async () => serverClient };
requireModule.cache[adminPath]!.exports = { createSupabaseAdminClient: () => adminClient };
const { GET, POST } = requireModule("../app/api/shares/route.ts") as typeof import("../app/api/shares/route");
const { DELETE } = requireModule("../app/api/shares/[id]/route.ts") as typeof import("../app/api/shares/[id]/route");

const auth = (id: string | null) => ({
  auth: { getUser: async () => ({ data: { user: id ? { id } : null }, error: null }) },
});

function sourceRow() {
  return {
    chart: calculate({ date: "2005-12-23", time: "08:37", gender: "male", calendar: "solar", topic: "general" }),
    reading: {
      summary: "일간과 오행을 살펴보세요.",
      personality: {
        overview: "평소의 반응을 돌아보세요.", example: "일상에서 생각을 살펴보세요.",
        strengths: "차분하게 생각할 수 있습니다.", cautions: "한 가지만 보고 단정하지 마세요.",
        evidence: ["dayMaster"], terms: [{ term: "일간", meaning: "태어난 날의 천간입니다." }],
      },
      career: {
        overview: "일하는 방식을 돌아보세요.", example: "여러 활동을 시도해 보세요.",
        evidence: ["elements"], terms: [{ term: "오행", meaning: "다섯 가지 상징 요소입니다." }],
      },
      relationships: {
        overview: "관계를 돌아보세요.", example: "상대의 이야기를 먼저 들어보세요.",
        evidence: ["dayPillar"], terms: [{ term: "일주", meaning: "태어난 날의 기둥입니다." }],
      },
    },
    schema_version: 1,
    reading_created_at: "2026-09-23T00:00:00.000Z",
  };
}

test("비로그인 사용자는 공유 목록·생성·삭제를 이용할 수 없다", async () => {
  serverClient = auth(null);
  const list = await GET();
  const create = await POST(new Request("http://localhost/api/shares", {
    method: "POST", body: JSON.stringify({ nickname: "별명" }),
  }));
  const remove = await DELETE(new Request("http://localhost/api/shares/00000000-0000-0000-0000-000000000000", {
    method: "DELETE",
  }), { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) });
  for (const response of [list, create, remove]) assert.equal(response.status, 401);
});

test("잘못된 공유 생성 요청은 400 또는 413으로 거절하고 DB에 접근하지 않는다", async () => {
  let databaseUsed = false;
  serverClient = {
    ...auth("owner-1"),
    from() { databaseUsed = true; throw new Error("should not query"); },
  };
  adminClient = { from() { databaseUsed = true; throw new Error("should not insert"); } };
  for (const body of ["{", "", "not-json"]) {
    const response = await POST(new Request("http://localhost/api/shares", { method: "POST", body }));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "요청 내용을 확인해주세요." });
  }
  for (const body of ["null", "[]", "{}", '{"nickname":42}', '{"nickname":"  "}']) {
    const response = await POST(new Request("http://localhost/api/shares", { method: "POST", body }));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "별명은 1~30자로 입력해주세요." });
  }
  const tooLong = await POST(new Request("http://localhost/api/shares", {
    method: "POST", body: JSON.stringify({ nickname: "a".repeat(300) }),
  }));
  assert.equal(tooLong.status, 413);
  assert.equal(databaseUsed, false);
});

test("공유 생성은 인증된 계정의 저장 결과만 조회하고 고정 사본을 저장한다", async () => {
  const source = sourceRow();
  const filters: Array<[string, unknown]> = [];
  let inserted: Record<string, unknown> | undefined;
  serverClient = {
    ...auth("owner-1"),
    from(table: string) {
      assert.equal(table, "saju_readings");
      const query = {
        select() { return query; },
        eq(field: string, value: unknown) { filters.push([field, value]); return query; },
        async maybeSingle() { return { data: source, error: null }; },
      };
      return query;
    },
  };
  adminClient = {
    from(table: string) {
      assert.equal(table, "saju_shared_readings");
      const query = {
        insert(value: Record<string, unknown>) { inserted = value; return query; },
        select() { return query; },
        async single() { return { data: { id: "share-id" }, error: null }; },
      };
      return query;
    },
  };
  const response = await POST(new Request("http://localhost/api/shares", {
    method: "POST", body: JSON.stringify({ nickname: "  별명  " }),
  }));
  assert.equal(response.status, 201);
  assert.deepEqual(filters, [["user_id", "owner-1"]]);
  assert.ok(inserted);
  assert.equal(inserted.user_id, "owner-1");
  assert.equal(inserted.nickname, "별명");
  assert.deepEqual(inserted.chart, source.chart);
  assert.deepEqual(inserted.reading, source.reading);
  assert.match(inserted.token_hash as string, /^[0-9a-f]{64}$/);
  const body = await response.json();
  assert.match(body.path, /^\/share\/[0-9a-f]{64}$/);
  assert.notEqual(body.path.slice("/share/".length), inserted.token_hash);
  assert.doesNotMatch(JSON.stringify(body), /2005-12-23|08:37|owner-1|token_hash/);
});

test("원본 출생정보가 섞인 저장 결과는 공유 생성 전에 거부한다", async () => {
  const source = sourceRow();
  let adminUsed = false;
  serverClient = {
    ...auth("owner-1"),
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: { ...source, chart: { ...source.chart, date: "2005-12-23" } }, error: null }; },
      };
      return query;
    },
  };
  adminClient = { from() { adminUsed = true; throw new Error("should not insert"); } };
  const response = await POST(new Request("http://localhost/api/shares", {
    method: "POST", body: JSON.stringify({ nickname: "별명" }),
  }));
  assert.equal(response.status, 422);
  assert.equal(adminUsed, false);
});

test("공유 삭제는 작성자 ID를 조건으로 넣고 타인의 링크는 찾지 못한 것으로 처리한다", async () => {
  const filters: Array<[string, unknown]> = [];
  serverClient = {
    ...auth("owner-1"),
    from(table: string) {
      assert.equal(table, "saju_shared_readings");
      const query = {
        delete() { return query; },
        eq(field: string, value: unknown) { filters.push([field, value]); return query; },
        select() { return query; },
        async maybeSingle() { return { data: null, error: null }; },
      };
      return query;
    },
  };
  const id = "00000000-0000-0000-0000-000000000000";
  const response = await DELETE(new Request(`http://localhost/api/shares/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
  assert.equal(response.status, 404);
  assert.deepEqual(filters, [["id", id], ["user_id", "owner-1"]]);
});
