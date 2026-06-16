import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listCustomers } from "@/lib/admin.functions";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: AdminCustomers,
});

function AdminCustomers() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await listCustomers();
        setRows(data as any[]);
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (
      (r.name || "").toLowerCase().includes(s) ||
      (r.phone || "").includes(s)
    );
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h2 className="text-base font-bold">Customers ({rows.length})</h2>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or mobile…"
        className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
      />
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customers found.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <div key={c.user_id} className="rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
              <div className="font-bold">{c.name || "—"}</div>
              <div className="text-xs text-muted-foreground">+91 {c.phone}</div>
              <div className="text-[10px] text-muted-foreground">
                Joined {new Date(c.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
