import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";

export function createSupabaseAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) throw new Error("Supabase secret key is missing");
  return createClient(supabaseConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
