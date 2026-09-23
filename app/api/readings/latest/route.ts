import { NextResponse } from "next/server";
import {
  parseReadingRow,
  readingUpsert,
} from "../../../../lib/saju/account-reading";
import { parseStoredReading } from "../../../../lib/saju/stored-reading";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

const NO_STORE = { "Cache-Control": "no-store" };

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

async function authenticated() {
  const supabase = await createSupabaseServerClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user) return null;
  return { supabase, user: data.user };
}

export async function GET() {
  try {
    const auth = await authenticated();
    if (!auth) return error("로그인이 필요합니다.", 401);
    const { data, error: queryError } = await auth.supabase
      .from("saju_readings")
      .select("chart,reading,schema_version,reading_created_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (queryError) return error("저장된 결과를 불러오지 못했습니다.", 503);
    if (!data) return NextResponse.json({ reading: null }, { headers: NO_STORE });
    const record = parseReadingRow(data);
    if (!record) return error("저장된 결과의 형식을 읽을 수 없습니다.", 422);
    return NextResponse.json({ reading: record }, { headers: NO_STORE });
  } catch {
    return error("저장된 결과를 불러오지 못했습니다.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticated();
    if (!auth) return error("로그인이 필요합니다.", 401);
    const raw = await request.text();
    if (raw.length > 100_000) return error("저장할 결과를 확인해주세요.", 413);
    const record = parseStoredReading(raw);
    if (!record) return error("저장할 결과를 확인해주세요.", 400);
    const { error: saveError } = await auth.supabase
      .from("saju_readings")
      .upsert(readingUpsert(record, auth.user.id), { onConflict: "user_id" });
    if (saveError) return error("계정에 저장하지 못했습니다.", 503);
    return NextResponse.json({ saved: true }, { headers: NO_STORE });
  } catch {
    return error("계정에 저장하지 못했습니다.", 503);
  }
}
