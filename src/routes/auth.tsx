import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Phone, ArrowRight, Loader2 } from "lucide-react";
import { saveProfile } from "@/lib/profile";
import { claimSession } from "@/lib/session-guard";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AppDrawer } from "@/components/AppDrawer";
import { CredoomWordmark } from "@/components/Brand";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Luxury Cabs" }] }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [needsPhone, setNeedsPhone] = useState(false);

  // After Google sign-in, check whether the profile has a phone number.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("name, phone")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;
      if (prof?.phone && prof.phone.length === 10) {
        // Already have phone — proceed to app.
        saveProfile({ name: prof.name ?? "", phone: prof.phone, createdAt: new Date().toISOString() });
        await claimSession("profiles", { column: "user_id", value: uid });
        navigate({ to: "/booking", replace: true });
      } else {
        setNeedsPhone(true);
      }
    }
    void check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void check(); });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [navigate]);

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) {
        toast.error("Google sign-in failed. Please try again.");
        setBusy(false);
        return;
      }
      // If redirected: nothing to do. If tokens returned, useEffect handles next step.
    } catch (e: any) {
      toast.error(e?.message ?? "Sign-in failed");
      setBusy(false);
    }
  }

  async function savePhone(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) {
      toast.error("Enter a 10-digit mobile number");
      return;
    }
    setBusy(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const fullName =
        user.user?.user_metadata?.full_name ||
        user.user?.user_metadata?.name ||
        user.user?.email?.split("@")[0] ||
        "Customer";
      const { error } = await supabase.from("profiles").upsert(
        { user_id: userId, name: fullName, phone: cleanPhone },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      saveProfile({ name: fullName, phone: cleanPhone, createdAt: new Date().toISOString() });
      await claimSession("profiles", { column: "user_id", value: userId });
      toast.success("Signed in");
      navigate({ to: "/booking", replace: true });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save phone");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell relative flex flex-col bg-gradient-to-b from-primary-soft/40 to-background px-6">
      <AppDrawer />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-12 flex flex-col items-center"
      >
        <CredoomWordmark className="scale-[1.6] origin-left" />
        <p className="mt-3 text-sm text-muted-foreground">Comfort. Class. Every ride.</p>
      </motion.div>

      {!needsPhone ? (
        <div className="mt-12 flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="text-center">
            <h1 className="text-xl font-bold text-primary">Sign in to continue</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              We use Google to keep your account secure.
            </p>
          </div>

          <button
            onClick={signInWithGoogle}
            disabled={busy}
            className="flex items-center justify-center gap-3 rounded-xl border border-border bg-white py-3.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.61Z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"/>
                  <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"/>
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/>
                </svg>
                Continue with Google
              </>
            )}
          </button>
        </div>
      ) : (
        <form
          onSubmit={savePhone}
          className="mt-10 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="text-center">
            <h1 className="text-xl font-bold text-primary">One last step</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Add your mobile number so the driver can reach you.
            </p>
          </div>

          <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3">
            <Phone className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">+91</span>
            <input
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile number"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </label>

          <button
            disabled={busy || phone.replace(/\D/g, "").length !== 10}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
      )}

      <p className="mt-auto py-6 text-center text-[10px] text-muted-foreground">
        By continuing you agree to our Terms & Privacy Policy.
      </p>
    </div>
  );
}
