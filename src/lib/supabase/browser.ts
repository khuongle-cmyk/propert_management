"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { LockFunc, SupabaseClient } from "@supabase/supabase-js";

/**
 * No-op lock: skips Navigator / Web Locks API used by @supabase/ssr 0.10.x + gotrue-js.
 * Page refreshes could leave the previous tab’s lock held briefly; the new page then
 * waited up to lockAcquireTimeout to acquire it, causing multi-second hangs. Safe for
 * typical single-tab staff app usage (no cross-tab session sync requirement).
 */
const noopLock: LockFunc = async (_name, _acquireTimeout, fn) => fn();

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  
  client = createBrowserClient(url, anonKey, {
    auth: {
      lock: noopLock,
    },
  });
  return client;
}