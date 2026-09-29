import test from "node:test";
import assert from "node:assert/strict";
import { GET as cron } from "../app/api/cron/daily-fortune/route";

test("예약 경로는 비밀값이 없거나 Authorization이 틀리면 작업 전에 거절한다", async () => {
  const prior = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    const withoutSecret = await cron(new Request("http://localhost:3000/api/cron/daily-fortune", {
      headers: { authorization: "Bearer guessed" },
    }));
    assert.equal(withoutSecret.status, 401);
    assert.equal(withoutSecret.headers.get("cache-control"), "no-store");

    process.env.CRON_SECRET = "test-cron-secret";
    for (const authorization of [undefined, "Bearer wrong", "test-cron-secret", "Bearer test-cron-secret-extra"]) {
      const response = await cron(new Request("http://localhost:3000/api/cron/daily-fortune", {
        headers: authorization ? { authorization } : undefined,
      }));
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "Unauthorized" });
    }
  } finally {
    if (prior === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prior;
  }
});

test("인증된 예약 작업도 서버 비밀 설정이 빠지면 실패로 표시한다", async () => {
  const prior = {
    cron: process.env.CRON_SECRET,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SECRET_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };
  try {
    process.env.CRON_SECRET = "test-cron-secret";
    delete process.env.SUPABASE_SECRET_KEY;
    const response = await cron(new Request("http://localhost:3000/api/cron/daily-fortune", {
      headers: { authorization: "Bearer test-cron-secret" },
    }));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "예약 작업 설정이 필요합니다." });
  } finally {
    for (const [name, value] of [
      ["CRON_SECRET", prior.cron],
      ["NEXT_PUBLIC_SUPABASE_URL", prior.supabaseUrl],
      ["SUPABASE_SECRET_KEY", prior.supabaseKey],
      ["GEMINI_API_KEY", prior.gemini],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
