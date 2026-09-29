import { NextResponse } from "next/server";
import { parseReadingRow } from "../../../lib/saju/account-reading";
import { createShareToken, normalizeShareNickname, parseSharedReading, shareExpiry } from "../../../lib/saju/shared-reading";
import { createSupabaseAdminClient } from "../../../lib/supabase/admin";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

const headers = { "Cache-Control": "no-store" };

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers });
}

async function authenticated() {
  const supabase = await createSupabaseServerClient();
  const { data, error: authError } = await supabase.auth.getUser();
  return !authError && data.user ? { supabase, user: data.user } : null;
}

export async function GET() {
  try {
    const auth = await authenticated();
    if (!auth) return error("로그인이 필요합니다.", 401);
    const { data, error: queryError } = await auth.supabase
      .from("saju_shared_readings")
      .select("id,nickname,created_at,expires_at")
      .eq("user_id", auth.user.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (queryError) return error("공유 링크 목록을 불러오지 못했습니다.", 503);
    return NextResponse.json({ shares: data }, { headers });
  } catch {
    return error("공유 링크 목록을 불러오지 못했습니다.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticated();
    if (!auth) return error("로그인이 필요합니다.", 401);
    const raw = await request.text();
    if (raw.length > 256) return error("별명을 확인해주세요.", 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return error("요청 내용을 확인해주세요.", 400);
    }
    const nickname = normalizeShareNickname(
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).nickname
        : null,
    );
    if (!nickname) return error("별명은 1~30자로 입력해주세요.", 400);
    const { data: source, error: sourceError } = await auth.supabase
      .from("saju_readings")
      .select("chart,reading,schema_version,reading_created_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (sourceError) return error("저장된 결과를 불러오지 못했습니다.", 503);
    if (!source || !parseReadingRow(source) || !parseSharedReading(source)) return error("먼저 정상 해석을 계정에 저장해주세요.", 422);
    const { token, hash } = createShareToken();
    const expiresAt = shareExpiry();
    const admin = createSupabaseAdminClient();
    const { data: created, error: insertError } = await admin
      .from("saju_shared_readings")
      .insert({
        user_id: auth.user.id,
        token_hash: hash,
        nickname,
        chart: source.chart,
        reading: source.reading,
        schema_version: source.schema_version,
        reading_created_at: source.reading_created_at,
        expires_at: expiresAt,
      })
      .select("id")
      .single();
    if (insertError || !created) return error("공유 링크를 만들지 못했습니다.", 503);
    return NextResponse.json({ id: created.id, path: `/share/${token}`, expiresAt }, { status: 201, headers });
  } catch {
    return error("공유 링크를 만들지 못했습니다.", 503);
  }
}
