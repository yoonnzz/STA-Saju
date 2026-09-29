import { cache } from "react";
import { createSupabaseAdminClient } from "../supabase/admin";
import { hashShareToken, parseSharedReading, validShareToken } from "./shared-reading";

export const loadSharedReading = cache(async (token: string) => {
  if (!validShareToken(token)) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("saju_shared_readings")
    .select("nickname,chart,reading,schema_version,reading_created_at,expires_at")
    .eq("token_hash", hashShareToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;
  const record = parseSharedReading(data);
  return record ? { nickname: data.nickname as string, record } : null;
});
