import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Phone, User as UserIcon, ArrowRight, Loader2 } from "lucide-react";
import { getProfile, saveProfile } from "@/lib/profile";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Luxury Cabs" }] }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = getProfile();
    if (p) navigate({ to: "/booking", replace: true });
  }, [navigate]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10 || !name.trim()) return;
    setBusy(true);
    saveProfile({
      name: name.trim(),
      phone: clean,
      createdAt: new Date().toISOString(),
    });
    setTimeout(() => navigate({ to: "/booking", replace: true }), 250);
  }

  const ready = name.trim().length > 0 && phone.replace(/\D/g, "").length >= 10;

  return (
    <div className="app-shell flex flex-col bg-gradient-to-b from-primary-soft/40 to-background px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-16"
      >
        <div className="font-display text-3xl font-bold text-primary">Luxury Cabs</div>
        <p className="mt-1 text-sm text-muted-foreground">Comfort. Class. Every ride.</p>
      </motion.div>

      <form
        onSubmit={submit}
        className="mt-10 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <div>
          <h1 className="text-lg font-bold">Login or create account</h1>
          <p className="text-xs text-muted-foreground">Tell us your name and number to continue.</p>
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
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>

      <p className="mt-auto py-6 text-center text-[10px] text-muted-foreground">
        By continuing you agree to our Terms & Privacy Policy.
      </p>
    </div>
  );
}
