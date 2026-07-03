import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Wallet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { requestWithdrawal } from "@/lib/driver.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/driver/wallet")({
  head: () => ({ meta: [{ title: "Wallet — Driver" }] }),
  component: DriverWallet,
});

function DriverWallet() {
  const [driver, setDriver] = useState<any | null>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: d } = await supabase.from("drivers").select("*").eq("user_id", u.user.id).maybeSingle();
    setDriver(d);
    if (!d) return;
    const [t, r] = await Promise.all([
      supabase.from("wallet_transactions").select("*").eq("driver_id", d.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("withdrawal_requests").select("*").eq("driver_id", d.id).order("created_at", { ascending: false }).limit(20),
    ]);
    setTxns(t.data ?? []);
    setReqs(r.data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setBusy(true);
    try {
      await requestWithdrawal({ data: { amount: amt } });
      toast.success("Withdrawal requested");
      setAmount("");
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  if (!driver) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3 py-3">
        <Link to="/driver" className="rounded-full p-2"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="font-bold">Wallet</div>
      </header>
      <div className="p-4 space-y-4">
        <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow">
          <div className="flex items-center gap-2 text-xs opacity-80"><Wallet className="h-4 w-4" /> Available Balance</div>
          <div className="mt-1 text-3xl font-bold">₹{Number(driver.wallet_balance).toFixed(2)}</div>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-4">
          <div className="text-sm font-semibold">Request withdrawal</div>
          <div className="mt-2 flex gap-2">
            <input type="number" min={1} max={Number(driver.wallet_balance)} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount ₹" className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
            <button disabled={busy} className="rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "…" : "Request"}</button>
          </div>
        </form>

        <div>
          <div className="mb-2 text-sm font-semibold">Withdrawal requests</div>
          {reqs.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
          <div className="space-y-1">
            {reqs.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-muted/40 p-2 text-xs">
                <span>₹{r.amount}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                  r.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                  r.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{r.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold">Ledger</div>
          {txns.length === 0 && <p className="text-xs text-muted-foreground">No transactions yet.</p>}
          <div className="space-y-1">
            {txns.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-2 py-1.5 text-xs">
                <div>
                  <div className="font-medium capitalize">{t.type}</div>
                  <div className="text-[10px] text-muted-foreground">{t.note || "—"} · {new Date(t.created_at).toLocaleDateString()}</div>
                </div>
                <div className="text-right">
                  <div className={cn("font-bold", Number(t.amount) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {Number(t.amount) >= 0 ? "+" : ""}₹{Number(t.amount).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">Bal ₹{Number(t.balance_after).toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
