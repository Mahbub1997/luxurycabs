import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { CredoomWordmark } from "@/components/Brand";
import { supabase } from "@/integrations/supabase/client";
import {
  checkIsAdmin,
  ensureMainAdmin,
  requestAdminAccess,
  MAIN_ADMIN_EMAIL,
} from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/login")({
  head: () => ({ meta: [{ title: "Admin — Luxury Cabs" }] }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
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

  function resolveEmail(input: string) {
    const v = input.trim().toLowerCase();
    if (!v) return "";
    // "luxury cabs" => main admin
    if (v === "luxury cabs" || v === "luxurycabs") return MAIN_ADMIN_EMAIL;
    if (v.includes("@")) return v;
    return `${v.replace(/\s+/g, "")}@admin.local`;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const email = resolveEmail(identifier);
      const isMain = email === MAIN_ADMIN_EMAIL;

      if (mode === "signup") {
        if (isMain) throw new Error("Main admin already exists. Use Sign in.");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/admin/login" },
        });
        if (error) throw error;
        await supabase.auth.signInWithPassword({ email, password });
        await requestAdminAccess();
        await supabase.auth.signOut();
        toast.success("Request sent. Main admin must approve your account.");
        setMode("login");
        return;
      }

      // login
      if (isMain) {
        // Bootstrap on first login
        await ensureMainAdmin({ data: { password } });
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const r = await checkIsAdmin();
      if (!r.isAdmin) {
        await supabase.auth.signOut();
        if (r.pending) throw new Error("Waiting for main admin approval");
        throw new Error("Not an admin account");
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
        <div className="mb-6 flex items-center justify-center gap-2 text-primary">
          <CredoomWordmark label="Luxury Cabs Admin" />
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h1 className="text-lg font-bold">{mode === "login" ? "Admin sign in" : "Request admin access"}</h1>
          <p className="text-[11px] text-muted-foreground">
            Main admin: <b>luxury cabs</b> · password <b>5678</b>.<br />
            Additional admins must be approved by the main admin.
          </p>
          <input
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Username or email"
            className="rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none"
          />
          <input
            type="password"
            required
            minLength={4}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none"
          />
          <button
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? "Sign in" : "Request access"}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {mode === "login" ? "New admin? Request access" : "Have an account? Sign in"}
          </button>
        </form>
        <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">
          ← Back to app
        </Link>
      </div>
    </div>
  );
}
