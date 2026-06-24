import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { CredoomWordmark } from "@/components/Brand";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { checkIsAdmin, claimSuperAdmin } from "@/lib/admin.functions";
import { toast } from "sonner";
import { claimSession } from "@/lib/session-guard";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin — Luxury Cabs" }] }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  async function gateOnce() {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    try {
      try { await claimSuperAdmin(); } catch { /* ignore */ }
      const r = await checkIsAdmin();
      if (r.isAdmin) {
        await claimSession("profiles", { column: "user_id", value: uid });
        navigate({ to: "/admin/bookings", replace: true });
      } else if (r.pending) {
        toast.message("Your admin request is pending approval.");
        await supabase.auth.signOut();
      } else {
        toast.error("This account is not registered as an admin.");
        await supabase.auth.signOut();
      }
    } catch (e: any) {
      toast.error(e?.message || "Sign-in failed");
      await supabase.auth.signOut();
    }
  }

  // Auto-gate after redirects (Google) or existing session
  useEffect(() => {
    void gateOnce();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void gateOnce();
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/admin/login",
      });
      if (result.error) {
        toast.error("Google sign-in failed");
        setBusy(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "Sign-in failed");
      setBusy(false);
    }
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const uname = username.trim().toLowerCase();
      const email = uname.includes("@") ? uname : `${uname.replace(/\s+/g, "")}@admin.local`;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error(error.message);
        setBusy(false);
        return;
      }
      await gateOnce();
    } catch (e: any) {
      toast.error(e?.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary-soft/40 to-background px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-primary">
          <CredoomWordmark label="Luxury Cabs Admin" />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Lock className="h-4 w-4 text-primary" /> Admin sign in
          </h1>

          <form onSubmit={signInWithPassword} className="flex flex-col gap-2">
            <label className="text-xs font-medium text-muted-foreground">Username or email</label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder="luxurycabs"
              required
            />
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </button>
          </form>

          <div className="my-1 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={signInWithGoogle}
            disabled={busy}
            className="flex items-center justify-center gap-3 rounded-xl border border-border bg-white py-2.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.61Z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/>
                <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/>
              </svg>
              Continue with Google
            </>}
          </button>

          <p className="text-[11px] text-muted-foreground">
            Use your admin username/password, or sign in with the Google account
            registered as an admin. The first Google sign-in here becomes the
            super-admin.
          </p>
        </div>
        <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">
          ← Back to app
        </Link>
      </div>
    </div>
  );
}
