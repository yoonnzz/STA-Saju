import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { koreaDate } from "../../../../lib/saju/daily-fortune";
import { ensureDailyFortune } from "../../../../lib/saju/daily-fortune-service";

export const runtime = "nodejs";
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key || !process.env.GEMINI_API_KEY?.trim()) {
    return NextResponse.json({ error: "예약 작업 설정이 필요합니다." }, { status: 503, headers: NO_STORE });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const date = koreaDate();
  let processed = 0;
  let failed = 0;
  let offset = 0;
  const started = Date.now();

  try {
    const { error: cleanupError } = await supabase.from("saju_daily_fortunes")
      .delete().lt("fortune_date", date);
    if (cleanupError) throw new Error("daily cleanup failed");
    while (Date.now() - started < 240_000) {
      const { data: rows, error } = await supabase.from("saju_readings")
        .select("user_id")
        .order("user_id")
        .range(offset, offset + 49);
      if (error) throw new Error("reading list failed");
      if (!rows?.length) break;
      for (let index = 0; index < rows.length; index += 5) {
        const batch = rows.slice(index, index + 5);
        const results = await Promise.allSettled(
          batch.map((row) => ensureDailyFortune(supabase, row.user_id, date)),
        );
        processed += results.filter((result) => result.status === "fulfilled").length;
        failed += results.filter((result) => result.status === "rejected").length;
        if (Date.now() - started >= 240_000) break;
      }
      offset += rows.length;
      if (rows.length < 50) break;
    }
    const incomplete = Date.now() - started >= 240_000;
    return NextResponse.json({ date, processed, failed, incomplete }, {
      status: failed || incomplete ? 503 : 200,
      headers: NO_STORE,
    });
  } catch {
    return NextResponse.json({ error: "예약 작업을 완료하지 못했습니다.", date, processed, failed }, {
      status: 503,
      headers: NO_STORE,
    });
  }
}
