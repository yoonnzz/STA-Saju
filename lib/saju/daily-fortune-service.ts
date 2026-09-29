import type { SupabaseClient } from "@supabase/supabase-js";
import { parseReadingRow } from "./account-reading";
import {
  DAILY_FORTUNE_SCHEMA,
  chartSignature,
  makeDailyFortunePrompt,
  validateDailyFortune,
  type DailyFortune,
} from "./daily-fortune";

const MODEL = "gemini-3.5-flash-lite";

export class DailyFortuneError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function generate(chart: Parameters<typeof makeDailyFortunePrompt>[0], date: string): Promise<DailyFortune> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new DailyFortuneError("AI 운세 설정이 아직 준비되지 않았습니다.", 503);

  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: makeDailyFortunePrompt(chart, date) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: DAILY_FORTUNE_SCHEMA },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new DailyFortuneError("AI 운세 요청이 지연되거나 연결되지 않았습니다. 다시 시도해주세요.", 503);
  }
  if (!response.ok) {
    if (response.status === 429) throw new DailyFortuneError("Gemini 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.", 503);
    if (response.status === 401 || response.status === 403) throw new DailyFortuneError("Gemini API 키를 확인해주세요.", 502);
    if (response.status === 404) throw new DailyFortuneError("지정한 Gemini 모델을 사용할 수 없습니다.", 502);
    throw new DailyFortuneError("AI 운세를 가져오지 못했습니다. 다시 시도해주세요.", 502);
  }

  try {
    const payload = await response.json();
    const generated = payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "").join("");
    return validateDailyFortune(JSON.parse(generated), chart, date);
  } catch {
    throw new DailyFortuneError("AI 운세 형식을 확인하지 못했습니다. 다시 시도해주세요.", 502);
  }
}

export async function ensureDailyFortune(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<{ fortune: DailyFortune; cached: boolean }> {
  const { data: readingRow, error: readingError } = await supabase
    .from("saju_readings")
    .select("chart,reading,schema_version,reading_created_at")
    .eq("user_id", userId).maybeSingle();
  if (readingError) throw new DailyFortuneError("계정의 사주 결과를 불러오지 못했습니다.", 503);
  if (!readingRow) throw new DailyFortuneError("먼저 사주 해석을 내 계정에 저장해주세요.", 404);
  const record = parseReadingRow(readingRow);
  if (!record) throw new DailyFortuneError("계정의 사주 결과를 확인하지 못했습니다.", 422);
  const signature = chartSignature(record.chart);

  const { data: saved, error: savedError } = await supabase.from("saju_daily_fortunes")
    .select("fortune,fortune_date,chart_signature")
    .eq("user_id", userId).maybeSingle();
  if (savedError) throw new DailyFortuneError("저장된 오늘의 운세를 불러오지 못했습니다.", 503);
  if (saved && saved.fortune_date === date && saved.chart_signature === signature) {
    try {
      return { fortune: validateDailyFortune(saved.fortune, record.chart, date), cached: true };
    } catch {
      throw new DailyFortuneError("저장된 오늘의 운세 형식을 확인하지 못했습니다.", 422);
    }
  }

  if (saved && saved.fortune_date !== date) {
    const { error: deleteError } = await supabase.from("saju_daily_fortunes")
      .delete().eq("user_id", userId);
    if (deleteError) throw new DailyFortuneError("지난 운세를 정리하지 못했습니다. 다시 시도해주세요.", 503);
  }

  const generated = await generate(record.chart, date);
  const { data: stored, error: storeError } = await supabase.rpc("save_saju_daily_fortune", {
    p_user_id: userId,
    p_fortune_date: date,
    p_chart_signature: signature,
    p_source_created_at: record.createdAt,
    p_fortune: generated,
  });
  if (storeError) {
    if (storeError.message.includes("source reading changed")) {
      throw new DailyFortuneError("사주 결과가 변경되었습니다. 다시 시도해주세요.", 409);
    }
    throw new DailyFortuneError("오늘의 운세를 저장하지 못했습니다. 다시 시도해주세요.", 503);
  }
  try {
    return { fortune: validateDailyFortune(stored, record.chart, date), cached: false };
  } catch {
    throw new DailyFortuneError("저장된 오늘의 운세 형식을 확인하지 못했습니다.", 422);
  }
}
