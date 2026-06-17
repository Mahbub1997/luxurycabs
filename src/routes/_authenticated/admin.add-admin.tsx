import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Shield, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { checkIsAdmin, createAdminAccount, listAdmins, removeAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/add-admin")({
  component: AddAdmin,
});

function AddAdmin() {
  const [isSuper, setIsSuper] = useState(false);
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const me = await checkIsAdmin();
      setIsSuper(!!me.isSuperAdmin);
      if (me.isSuperAdmin) setAdmins(await listAdmins());
    } catch {}
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await createAdminAccount({ data: { username, password } });
      toast.success("Admin created");
      setUsername(""); setPassword("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function remove(role_id: string) {
    if (!confirm("Remove this admin?")) return;
    try {
      await removeAdmin({ data: { role_id } });
      toast.success("Removed");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!isSuper) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Only the main admin can manage admin accounts.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
          <UserPlus className="h-4 w-4 text-primary" /> Add new admin
        </h2>
        <form onSubmit={submit} className="flex flex-col gap-2">
          <input
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username (e.g. ravi)"
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none"
          />
          <input
            type="password"
            required
            minLength={4}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 4 chars)"
            className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none"
          />
          <button
            disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create admin
          </button>
          <p className="text-[11px] text-muted-foreground">
            New admin can sign in immediately at <span className="font-mono">/admin/login</span> with this username and password.
          </p>
        </form>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <Shield className="h-4 w-4 text-primary" /> All admins ({admins.length})
        </h2>
        <div className="flex flex-col gap-2">
          {admins.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
              <div>
                <div className="font-bold">{a.email}</div>
                <div className="text-[11px] text-muted-foreground">
                  {a.role === "super_admin" ? "Main admin" : "Admin"} · since {a.approved_at ? new Date(a.approved_at).toLocaleDateString() : "—"}
                </div>
              </div>
              {a.role !== "super_admin" && (
                <button onClick={() => remove(a.id)} className="rounded-lg bg-rose-600 px-2 py-1.5 text-xs font-bold text-white">
                  <Trash2 className="inline h-3 w-3 mr-1" />Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
