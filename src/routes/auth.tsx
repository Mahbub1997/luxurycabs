import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Phone, User as UserIcon, ArrowRight, Loader2 } from "lucide-react";
import { saveProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { AppDrawer } from "@/components/AppDrawer";
import { CredoomWordmark } from "@/components/Brand";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Luxury Cabs" }] }),
  component: Auth,
});

// Internal: one mobile number ⇒ one synthetic email ⇒ exactly one account.
const emailFor = (phone: string) => `cust${phone}@luxurycabs.app`;
// Fixed app-wide password derived from phone (no user-facing secret).
const passwordFor = (phone: string) => `LX-${phone}-CUST`;

function Auth() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
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
    if (!name.trim() || cleanPhone.length !== 10) return;
    setBusy(true);
    try {
      const email = emailFor(cleanPhone);
      const password = passwordFor(cleanPhone);

      // Try sign in; if account doesn't exist, create it.
      let res = await supabase.auth.signInWithPassword({ email, password });
      if (res.error) {
        const signup = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name: name.trim(), phone: cleanPhone } },
        });
        if (signup.error && !signup.error.message?.toLowerCase().includes("already")) {
          throw signup.error;
        }
        res = await supabase.auth.signInWithPassword({ email, password });
        if (res.error) throw res.error;
      }

      const uid = res.data.user?.id;
      if (uid) {
        await supabase.from("profiles").upsert(
          { user_id: uid, name: name.trim(), phone: cleanPhone },
          { onConflict: "user_id" }
        );
      }
      saveProfile({ name: name.trim(), phone: cleanPhone, createdAt: new Date().toISOString() });
      toast.success("Signed in");
      navigate({ to: "/booking", replace: true });
    } catch (err: any) {
      toast.error(err.message || "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  const ready = name.trim().length > 0 && phone.replace(/\D/g, "").length === 10;

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
            Enter your name and mobile number to login.
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

        <button
          disabled={!ready || busy}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Login <ArrowRight className="h-4 w-4" /></>}
        </button>

      </form>


      <p className="mt-auto py-6 text-center text-[10px] text-muted-foreground">
        By continuing you agree to our Terms & Privacy Policy.
      </p>
    </div>
  );
}
