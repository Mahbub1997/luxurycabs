import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CrownCarLogo } from "@/components/Brand";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/driver/login")({
  head: () => ({ meta: [{ title: "Driver Login — Luxury Cabs" }] }),
  component: DriverLogin,
});

function DriverLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const { data: d } = await supabase.from("drivers").select("id").eq("user_id", data.user.id).maybeSingle();
        if (d) navigate({ to: "/driver", replace: true });
      }
    })();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/driver", replace: true });
    } catch (e: any) {
      toast.error(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary-soft/40 to-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-primary">
          <CrownCarLogo className="h-7 w-7" />
          <span className="font-display text-xl font-bold">Luxury Cabs Driver</span>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none" />
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none" />
          <button disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </button>
          <Link to="/driver/signup" className="text-center text-xs text-primary underline">New driver? Register here</Link>
        </form>
        <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">← Back to app</Link>
      </div>
    </div>
  );
}
