import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Phone, User as UserIcon, ArrowRight, Loader2, KeyRound, HelpCircle } from "lucide-react";
import { saveProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { AppDrawer } from "@/components/AppDrawer";
import { CredoomWordmark } from "@/components/Brand";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Luxury Cabs" }] }),
  component: Auth,
});

// Internal synthetic email so each mobile number maps to exactly one account.
const emailFor = (phone: string) => `${phone}@customer.luxurycabs.local`;
// Supabase requires >= 6 char passwords; pad PIN with a fixed suffix.
const pinToPassword = (pin: string) => `${pin}-CUST`;

function Auth() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) navigate({ to: "/booking", replace: true });
    })();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const cleanPhone = phone.replace(/\D/g, "");
    const cleanPin = pin.replace(/\D/g, "");
    if (!name.trim() || cleanPhone.length !== 10 || cleanPin.length !== 4) return;
    setBusy(true);
    try {
      const email = emailFor(cleanPhone);
      const password = pinToPassword(cleanPin);

      // Try sign in first
      let res = await supabase.auth.signInWithPassword({ email, password });

      if (res.error) {
        // If credentials are wrong it could mean wrong PIN OR account doesn't exist yet.
        // Attempt signup; if that fails because user exists, then PIN was wrong.
        const signup = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim(), phone: cleanPhone } },
        });
        if (signup.error) {
          if (signup.error.message?.toLowerCase().includes("already")) {
            throw new Error("Incorrect PIN for this mobile number");
          }
          throw signup.error;
        }
        // Sign in after signup
        res = await supabase.auth.signInWithPassword({ email, password });
        if (res.error) throw res.error;
        toast.success("Account created");
      } else {
        toast.success("Signed in");
      }

      const uid = res.data.user?.id;
      if (uid) {
        await supabase.from("profiles").upsert(
          { user_id: uid, name: name.trim(), phone: cleanPhone },
          { onConflict: "user_id" }
        );
      }
      saveProfile({ name: name.trim(), phone: cleanPhone, createdAt: new Date().toISOString() });
      navigate({ to: "/booking", replace: true });
    } catch (err: any) {
      toast.error(err.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  const ready =
    name.trim().length > 0 &&
    phone.replace(/\D/g, "").length === 10 &&
    pin.replace(/\D/g, "").length === 4;

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

      <form
        onSubmit={submit}
        className="mt-10 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="text-center">
          <h1 className="text-xl font-bold text-primary">Login to continue</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            First time? Your 4-digit PIN will be set automatically.
          </p>
        </div>

        <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3">
          <UserIcon className="h-4 w-4 text-primary" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </label>

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

        <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3">
          <KeyRound className="h-4 w-4 text-primary" />
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4-digit PIN"
            className="flex-1 bg-transparent text-sm tracking-[0.4em] outline-none"
          />
        </label>

        <button
          disabled={!ready || busy}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
        </button>

        <button
          type="button"
          onClick={() => setShowForgot((v) => !v)}
          className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5" /> Forgot PIN / mobile?
        </button>

        {showForgot && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Please contact our support team to reset your PIN or recover your registered
            mobile number. Share your full name and any previous booking ID for verification.
            <div className="mt-1 font-semibold text-foreground">📞 Support: +91 95661 23456</div>
          </div>
        )}
      </form>

      <p className="mt-auto py-6 text-center text-[10px] text-muted-foreground">
        By continuing you agree to our Terms & Privacy Policy.
      </p>
    </div>
  );
}
