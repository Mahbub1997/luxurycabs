import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { CredoomWordmark } from "@/components/Brand";
import { supabase } from "@/integrations/supabase/client";
import {
  checkIsAdmin,
  ensureMainAdmin,
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
      if (isMain) {
        // Bootstrap main admin on first login
        await ensureMainAdmin({ data: { password } });
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const r = await checkIsAdmin();
      if (!r.isAdmin) {
        await supabase.auth.signOut();
        throw new Error("This account is not an admin. Ask the main admin to add you.");
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
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Lock className="h-4 w-4 text-primary" /> Admin sign in
          </h1>
          <p className="text-[11px] text-muted-foreground">
            Only registered admins can sign in. New admins are created by the main admin from inside the panel.
          </p>
          <input
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="Username"
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </button>
        </form>
        <Link to="/" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">
          ← Back to app
        </Link>
      </div>
    </div>
  );
}
