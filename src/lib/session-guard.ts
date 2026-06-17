/**
 * Single-active-session enforcement.
 *
 * Production behaviour:
 *  - On login we generate a fresh session id, write it to the user/driver row,
 *    and stash it in localStorage.
 *  - A guard hook subscribes to row updates; if the DB session id no longer
 *    matches the local one, we sign out (another device took over).
 *
 * Bypasses:
 *  - VITE_APP_MODE !== "production" (any non-prod build skips enforcement)
 *  - row.is_test_account === true (per-account opt-out)
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Table = "profiles" | "drivers";

const SESSION_KEY = (table: Table) => `lx.session.${table}`;

function makeSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function isProductionMode(): boolean {
  return (import.meta.env.VITE_APP_MODE ?? "").toLowerCase() === "production";
}

/** Generates a new session id and claims it on the row. Returns the id. */
export async function claimSession(table: Table, rowMatch: { column: string; value: string }) {
  const sessionId = makeSessionId();
  try {
    await supabase
      .from(table)
      .update({ active_session_id: sessionId, session_updated_at: new Date().toISOString() } as any)
      .eq(rowMatch.column, rowMatch.value);
  } catch {
    /* non-fatal — guard will still work if row updates later */
  }
  try { localStorage.setItem(SESSION_KEY(table), sessionId); } catch {}
  return sessionId;
}

export function getLocalSessionId(table: Table): string | null {
  try { return localStorage.getItem(SESSION_KEY(table)); } catch { return null; }
}

export function clearLocalSessionId(table: Table) {
  try { localStorage.removeItem(SESSION_KEY(table)); } catch {}
}

/**
 * Watches the row for active_session_id changes. If the DB value differs from
 * the local one (and prod-mode + non-test account), signs out and redirects.
 */
export function useSessionGuard(
  table: Table,
  match: { column: string; value: string | null | undefined } | null,
  redirectTo: string
) {
  const matchCol = match?.column;
  const matchVal = match?.value ?? null;
  useEffect(() => {
    if (!matchCol || !matchVal) return;
    if (!isProductionMode()) return; // bypass outside prod

    let cancelled = false;

    async function check(remote?: any) {
      if (cancelled) return;
      const local = getLocalSessionId(table);
      if (!local) return;
      let row = remote;
      if (!row) {
        const { data } = await supabase
          .from(table)
          .select("active_session_id, is_test_account")
          .eq(matchCol!, matchVal!)
          .maybeSingle();
        row = data;
      }
      if (!row) return;
      if (row.is_test_account) return;
      const remoteId: string | null = row.active_session_id ?? null;
      if (remoteId && remoteId !== local) {
        clearLocalSessionId(table);
        toast.error("Signed out — your account was opened on another device.");
        await supabase.auth.signOut();
        if (typeof window !== "undefined") window.location.replace(redirectTo);
      }
    }

    void check();
    const channel = supabase
      .channel(`session-guard:${table}:${matchVal}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table, filter: `${matchCol}=eq.${matchVal}` },
        (payload) => void check(payload.new)
      )
      .subscribe();

    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_KEY(table) && e.newValue === null) {
        void supabase.auth.signOut();
        if (typeof window !== "undefined") window.location.replace(redirectTo);
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      window.removeEventListener("storage", onStorage);
    };
  }, [table, matchCol, matchVal, redirectTo]);
}
