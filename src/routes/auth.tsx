import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Phone, User as UserIcon, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { getProfile, saveProfile } from "@/lib/profile";
import { AppDrawer } from "@/components/AppDrawer";
import { CredoomWordmark } from "@/components/Brand";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Luxury Cabs" }] }),
  component: Auth,
});

function Auth() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"details" | "otp">("details");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = getProfile();
    if (p) navigate({ to: "/booking", replace: true });
  }, [navigate]);

  function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10 || !name.trim()) return;
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedOtp(code);
    setStep("otp");
    toast.success(`OTP sent to +91 ${clean}`);
  }

  function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length !== 4) return;
    setBusy(true);
    if (otp !== generatedOtp) {
      setBusy(false);
      toast.error("Invalid OTP");
      return;
    }
    saveProfile({
      name: name.trim(),
      phone: phone.replace(/\D/g, ""),
      createdAt: new Date().toISOString(),
    });
    setTimeout(() => navigate({ to: "/booking", replace: true }), 200);
  }

  function resend() {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setGeneratedOtp(code);
    setOtp("");
    toast.success("OTP resent");
  }

  const ready = name.trim().length > 0 && phone.replace(/\D/g, "").length >= 10;

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

      {step === "details" ? (
        <form
          onSubmit={sendOtp}
          className="mt-12 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="text-center">
            <h1 className="text-xl font-bold text-primary">Please login to continue</h1>
            <p className="mt-1 text-xs text-muted-foreground">Enter your name and mobile to receive an OTP.</p>
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
            disabled={!ready}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            Send OTP <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <form
          onSubmit={verifyOtp}
          className="mt-12 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
            <h1 className="mt-2 text-xl font-bold text-primary">Verify mobile</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              OTP sent to +91 {phone}.{" "}
              <span className="rounded bg-primary-soft px-1.5 py-0.5 font-mono font-bold text-primary">
                {generatedOtp}
              </span>
            </p>
          </div>
          <input
            inputMode="numeric"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4-digit OTP"
            className="rounded-xl border border-border bg-background px-3 py-3 text-center text-lg tracking-[0.6em] outline-none"
          />
          <button
            disabled={otp.length !== 4 || busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Verify & continue <ArrowRight className="h-4 w-4" /></>}
          </button>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button type="button" onClick={() => setStep("details")} className="underline">Change number</button>
            <button type="button" onClick={resend} className="underline">Resend OTP</button>
          </div>
        </form>
      )}

      <p className="mt-auto py-6 text-center text-[10px] text-muted-foreground">
        By continuing you agree to our Terms & Privacy Policy.
      </p>
    </div>
  );
}
