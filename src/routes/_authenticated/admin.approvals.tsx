import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { decideWithdrawal, updateDriverStatus } from "@/lib/admin.functions";
import { Check, XCircle, UserCheck, Wallet, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/approvals")({
  component: AdminApprovals,
});

function AdminApprovals() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [d, w] = await Promise.all([
      supabase.from("drivers").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      supabase
        .from("withdrawal_requests")
        .select("*, drivers(name, phone, wallet_balance)")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
    setDrivers(d.data ?? []);
    setWithdrawals(w.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-approvals")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function approveDriver(id: string) {
    try {
      await updateDriverStatus({ data: { driver_id: id, status: "approved" } });
      toast.success("Driver approved");
      load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function rejectDriver(id: string) {
    try {
      await updateDriverStatus({ data: { driver_id: id, status: "rejected" } });
      toast.success("Driver rejected");
      load();
    } catch (e: any) { toast.error(e.message); }
  }
  async function decide(id: string, approve: boolean) {
    try {
      await decideWithdrawal({ data: { request_id: id, approve } });
      toast.success(approve ? "Withdrawal approved" : "Withdrawal rejected");
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <UserCheck className="h-4 w-4 text-primary" /> Driver Approvals ({drivers.length})
        </h2>
        {drivers.length === 0 && <p className="text-sm text-muted-foreground">No pending drivers.</p>}
        <div className="flex flex-col gap-2">
          {drivers.map((d) => (
            <div key={d.id} className="rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold">{d.name}</div>
                  <div className="text-xs text-muted-foreground">{d.phone} · {d.email}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {d.vehicle_type} · {d.vehicle_model || "—"} · {d.vehicle_number || "—"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">License: {d.license_number || "—"}</div>
                </div>
                <Link to="/admin/drivers" className="text-[10px] text-primary underline">Docs</Link>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => approveDriver(d.id)} className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white">
                  <Check className="inline h-3 w-3 mr-1" />Approve
                </button>
                <button onClick={() => rejectDriver(d.id)} className="flex-1 rounded-lg bg-rose-600 px-2 py-1.5 text-xs font-bold text-white">
                  <XCircle className="inline h-3 w-3 mr-1" />Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <Wallet className="h-4 w-4 text-primary" /> Withdrawal Requests ({withdrawals.length})
        </h2>
        {withdrawals.length === 0 && <p className="text-sm text-muted-foreground">No pending withdrawals.</p>}
        <div className="flex flex-col gap-2">
          {withdrawals.map((w) => (
            <div key={w.id} className="rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold">{w.drivers?.name ?? "Driver"}</div>
                  <div className="text-xs text-muted-foreground">{w.drivers?.phone}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Wallet bal: ₹{Number(w.drivers?.wallet_balance ?? 0).toFixed(2)}
                  </div>
                  {w.note && <div className="mt-1 text-[11px] italic text-muted-foreground">"{w.note}"</div>}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold">₹{Number(w.amount).toFixed(2)}</div>
                  <div className="text-[10px] text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => decide(w.id, true)} className="flex-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-bold text-white">
                  <Check className="inline h-3 w-3 mr-1" />Approve & debit
                </button>
                <button onClick={() => decide(w.id, false)} className="flex-1 rounded-lg bg-rose-600 px-2 py-1.5 text-xs font-bold text-white">
                  <XCircle className="inline h-3 w-3 mr-1" />Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
