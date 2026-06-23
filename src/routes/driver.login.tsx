import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CredoomWordmark } from "@/components/Brand";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { claimSession } from "@/lib/session-guard";
import { toast } from "sonner";

export const Route = createFileRoute("/driver/login")({
  head: () => ({ meta: [{ title: "Driver Login — Luxury Cabs" }] }),
  component: DriverLogin,
});

function DriverLogin() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function gate() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: d } = await supabase
        .from("drivers")
        .select("id, status")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (d) {
        await claimSession("drivers", { column: "user_id", value: uid });
        navigate({ to: "/driver", replace: true });
      } else {
        // No driver profile yet — go finish registration.
        navigate({ to: "/driver/signup", replace: true });
      }
    }
    void gate();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void gate(); });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [navigate]);

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/driver/login",
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary-soft/40 to-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-primary">
          <CredoomWordmark label="Luxury Cabs Driver" />
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h1 className="text-lg font-bold">Driver sign in</h1>
          <p className="text-[11px] text-muted-foreground">
            Sign in with Google. New drivers will be asked to complete a short
            registration after sign-in.
          </p>
          <button
            onClick={signInWithGoogle}
            disabled={busy}
            className="flex items-center justify-center gap-3 rounded-xl border border-border bg-white py-3 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-60"
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
        </div>
        <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">← Back to app</Link>
      </div>
    </div>
  );
}
