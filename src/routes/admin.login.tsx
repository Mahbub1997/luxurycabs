import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { claimFirstAdmin, checkIsAdmin } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin — Luxury Cabs" }] }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        try {
          const r = await checkIsAdmin();
          if (r.isAdmin) navigate({ to: "/admin/bookings", replace: true });
        } catch {}
      }
    })();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/admin/login" },
        });
        if (error) throw error;
        // Try claim first admin
        await supabase.auth.signInWithPassword({ email, password });
        try {
          await claimFirstAdmin();
          toast.success("First admin claimed");
        } catch (e: any) {
          toast.message(e.message || "Signed up. Ask existing admin to grant role.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const r = await checkIsAdmin();
      if (!r.isAdmin) {
        if (!r.anyAdmin) {
          await claimFirstAdmin();
          toast.success("You are now the first admin");
        } else {
          await supabase.auth.signOut();
          throw new Error("Not an admin account");
        }
      }
      navigate({ to: "/admin/bookings", replace: true });
    } catch (e: any) {
      toast.error(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary-soft/40 to-background px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2 text-primary">
          <Shield className="h-6 w-6" />
          <span className="font-display text-xl font-bold">Admin Console</span>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h1 className="text-lg font-bold">{mode === "login" ? "Admin sign in" : "Create admin account"}</h1>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none"
          />
          <button
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? "Sign in" : "Create account"}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "login" ? "First admin? Create account" : "Have an account? Sign in"}
          </button>
        </form>
        <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">
          ← Back to app
        </Link>
      </div>
    </div>
  );
}
