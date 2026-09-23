import { NextResponse } from "next/server";
import { calculate, InputError, type SajuInput } from "../../../lib/saju/chart";
import {
  GEMINI_RESPONSE_SCHEMA,
  makeGeminiPrompt,
  validateGeminiReading,
} from "../../../lib/saju/interpretation";
import { readingUpsert } from "../../../lib/saju/account-reading";
import type { StoredReading } from "../../../lib/saju/stored-reading";
import { hasSupabaseConfig } from "../../../lib/supabase/config";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const runtime = "nodejs";

const MODEL = "gemini-3.5-flash-lite";
const NO_STORE = { "Cache-Control": "no-store" };

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: NO_STORE });
}

async function saveForSignedInUser(record: StoredReading) {
  if (!hasSupabaseConfig()) return "signed_out" as const;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error: authError } = await supabase.auth.getUser();
    if (authError || !data.user) return "signed_out" as const;
    const { error: saveError } = await supabase
      .from("saju_readings")
      .upsert(readingUpsert(record, data.user.id), { onConflict: "user_id" });
    return saveError ? ("failed" as const) : ("saved" as const);
  } catch {
    return "failed" as const;
  }
}

export async function POST(request: Request) {
  let input: SajuInput;
  try {
    const body = await request.text();
    if (body.length > 1024) return error("입력 내용을 확인해주세요.", 413);
    const data: unknown = JSON.parse(body);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return error("입력 내용을 확인해주세요.", 400);
    }
    const fields = data as Record<string, unknown>;
    input = {
      date: fields.date as string,
      time: fields.time as string,
      gender: fields.gender as "male" | "female",
      calendar: "solar",
      topic: "general",
    };
  } catch {
    return error("입력 내용을 확인해주세요.", 400);
  }

  let chart;
  try {
    chart = calculate(input);
  } catch (caught) {
    return error(
      caught instanceof InputError ? caught.message : "계산하지 못했습니다.",
      400,
    );
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return error("AI 해석 설정이 아직 준비되지 않았습니다.", 503);
  }

  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: makeGeminiPrompt(chart) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: GEMINI_RESPONSE_SCHEMA,
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(30000),
      },
    );
  } catch {
    return error("AI 해석 요청이 지연되거나 연결되지 않았습니다. 다시 시도해주세요.", 503);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return error("Gemini API 키를 확인해주세요. 서버의 .env 설정이 필요합니다.", 502);
    }
    if (response.status === 404) {
      return error("지정한 Gemini 모델을 사용할 수 없습니다. 모델 설정을 확인해주세요.", 502);
    }
    if (response.status === 429) {
      return error("Gemini 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.", 503);
    }
    if (response.status === 400) {
      return error("Gemini 요청 형식을 처리하지 못했습니다. 설정을 확인해주세요.", 502);
    }
    return error("AI 해석을 가져오지 못했습니다. 잠시 후 다시 시도해주세요.", 502);
  }

  try {
    const payload = await response.json();
    const generated = payload?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || "")
      .join("");
    const reading = validateGeminiReading(JSON.parse(generated), false, chart);
    const record: StoredReading = {
      version: 1,
      createdAt: new Date().toISOString(),
      chart,
      reading,
    };
    const accountSave = await saveForSignedInUser(record);
    return NextResponse.json({ chart, reading, createdAt: record.createdAt, accountSave }, { headers: NO_STORE });
  } catch {
    return error("AI 해석 형식을 확인하지 못했습니다. 다시 시도해주세요.", 502);
  }
}
