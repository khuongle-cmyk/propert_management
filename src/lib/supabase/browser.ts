"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let supabaseClient: SupabaseClient | null = null;

function getEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, anonKey };
}

// Lazy init; uses cookie-based session so Route Handlers can read auth via createServerClient.
export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient;

  const { url, anonKey } = getEnv();
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

  supabaseClient = createBrowserClient(url, anonKey);
  return supabaseClient;
}
