import { NextResponse } from "next/server";
import { koreaDate } from "../../../lib/saju/daily-fortune";
import { DailyFortuneError, ensureDailyFortune } from "../../../lib/saju/daily-fortune-service";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) {
      return NextResponse.json({ error: "오늘의 운세는 로그인 후 볼 수 있습니다." }, { status: 401, headers: NO_STORE });
    }
    const result = await ensureDailyFortune(supabase, data.user.id, koreaDate());
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (caught) {
    const known = caught instanceof DailyFortuneError ? caught : null;
    return NextResponse.json({ error: known?.message || "오늘의 운세를 불러오지 못했습니다. 다시 시도해주세요." }, {
      status: known?.status || 503,
      headers: NO_STORE,
    });
  }
}
