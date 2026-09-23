import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./config";

let client: SupabaseClient | null = null;

export function createSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    const { url, key } = supabaseConfig();
    client = createBrowserClient(url, key);
  }
  return client;
}
