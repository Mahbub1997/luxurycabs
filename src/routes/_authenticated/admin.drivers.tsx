import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wallet, X, Check, XCircle, FileText, Loader2, Search } from "lucide-react";
import { decideWithdrawal, updateDriverStatus, getDriverDocUrls } from "@/lib/admin.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/drivers")({
  component: AdminDrivers,
});

const TABS = ["pending", "approved", "suspended", "all"] as const;
type Tab = (typeof TABS)[number];

function AdminDrivers() {
  const [tab, setTab] = useState<Tab>("pending");
  const [drivers, setDrivers] = useState<any[]>([]);
  const [walletFor, setWalletFor] = useState<any | null>(null);
  const [docsFor, setDocsFor] = useState<any | null>(null);
  const [query, setQuery] = useState("");

  async function load() {
    let q = supabase.from("drivers").select("*").order("created_at", { ascending: false });
    if (tab !== "all") q = q.eq("status", tab);
    const { data } = await q;
    setDrivers(data ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tab]);

  const qq = query.trim().toLowerCase();
  const filtered = !qq ? drivers : drivers.filter((d) =>
    (d.name ?? "").toLowerCase().includes(qq) ||
    (d.phone ?? "").toLowerCase().includes(qq) ||
    (d.email ?? "").toLowerCase().includes(qq) ||
    (d.vehicle_number ?? "").toLowerCase().includes(qq) ||
    (d.license_number ?? "").toLowerCase().includes(qq)
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">Drivers ({filtered.length})</h2>
      </div>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, email or vehicle number"
          className="w-full bg-transparent text-sm outline-none"
        />
        {query && <button onClick={() => setQuery("")}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
      </div>
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium capitalize",
              tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((d) => (
          <div key={d.id} className="rounded-2xl border border-border bg-card p-3 text-sm shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold">{d.name}</div>
                <div className="text-xs text-muted-foreground">{d.phone}</div>
                <div className="text-[11px] text-muted-foreground">
                  {d.vehicle_type} · {d.vehicle_model || "—"} · {d.vehicle_number || "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">License: {d.license_number || "—"}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                  d.status === "approved" ? "bg-emerald-100 text-emerald-700"
                  : d.status === "pending" ? "bg-amber-100 text-amber-700"
                  : "bg-rose-100 text-rose-700"
                )}>{d.status}</span>
                <span className="text-[10px] text-muted-foreground">{d.is_online ? "🟢 Online" : "⚫ Offline"}</span>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <div className="text-xs">
                Wallet: <span className="font-bold">₹{Number(d.wallet_balance).toFixed(2)}</span>
                <span className="ml-2 text-muted-foreground">{d.total_trips} trips · ⭐ {Number(d.rating).toFixed(1)}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setDocsFor(d)} className="rounded-lg bg-muted px-2 py-1 text-xs">
                  <FileText className="inline h-3 w-3 mr-1" />Docs
                </button>
                <button onClick={() => setWalletFor(d)} className="rounded-lg bg-muted px-2 py-1 text-xs">
                  <Wallet className="inline h-3 w-3 mr-1" />Ledger
                </button>
                {d.status !== "approved" && (
                  <button
                    onClick={async () => {
                      await updateDriverStatus({ data: { driver_id: d.id, status: "approved" } });
                      toast.success("Approved"); load();
                    }}
                    className="rounded-lg bg-emerald-600 px-2 py-1 text-xs text-white"
                  >Approve</button>
                )}
                {d.status === "pending" && (
                  <button
                    onClick={async () => {
                      await updateDriverStatus({ data: { driver_id: d.id, status: "rejected" } });
                      toast.success("Rejected"); load();
                    }}
                    className="rounded-lg bg-rose-600 px-2 py-1 text-xs text-white"
                  >Reject</button>
                )}
                {d.status === "approved" && (
                  <button
                    onClick={async () => {
                      await updateDriverStatus({ data: { driver_id: d.id, status: "suspended" } });
                      toast.success("Suspended"); load();
                    }}
                    className="rounded-lg bg-rose-600 px-2 py-1 text-xs text-white"
                  >Deactivate</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No drivers in this tab.</p>}
      </div>

      {walletFor && <WalletModal driver={walletFor} onClose={() => { setWalletFor(null); load(); }} />}
      {docsFor && <DocsModal driver={docsFor} onClose={() => setDocsFor(null)} />}
    </div>
  );
}

function DocsModal({ driver, onClose }: { driver: any; onClose: () => void }) {
  const [urls, setUrls] = useState<{ selfie: string | null; license: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await getDriverDocUrls({ data: { driver_id: driver.id } });
        setUrls(r);
      } catch (e: any) { setErr(e.message); }
    })();
  }, [driver.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-5 sm:rounded-3xl max-h-[85vh] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{driver.name} — Documents</h3>
            <p className="text-xs text-muted-foreground">License #{driver.license_number || "—"}</p>
          </div>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        {err && <p className="text-sm text-rose-600">{err}</p>}
        {!urls && !err && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {urls && (
          <div className="grid grid-cols-1 gap-3">
            <DocImage label="Selfie" url={urls.selfie} />
            <DocImage label="Driving License" url={urls.license} />
          </div>
        )}
      </div>
    </div>
  );
}

function DocImage({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{label}</div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={label} className="w-full rounded-xl border border-border" />
        </a>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Not uploaded
        </div>
      )}
    </div>
  );
}

function WalletModal({ driver, onClose }: { driver: any; onClose: () => void }) {
  const [txns, setTxns] = useState<any[]>([]);
  const [reqs, setReqs] = useState<any[]>([]);

  async function load() {
    const [t, r] = await Promise.all([
      supabase.from("wallet_transactions").select("*").eq("driver_id", driver.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("withdrawal_requests").select("*").eq("driver_id", driver.id).order("created_at", { ascending: false }).limit(20),
    ]);
    setTxns(t.data ?? []);
    setReqs(r.data ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [driver.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-5 sm:rounded-3xl max-h-[85vh] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{driver.name}</h3>
            <p className="text-xs text-muted-foreground">Wallet ₹{Number(driver.wallet_balance).toFixed(2)}</p>
          </div>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>

        <h4 className="mt-2 text-sm font-bold">Withdrawal requests</h4>
        {reqs.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
        <div className="flex flex-col gap-2">
          {reqs.map((r) => (
            <div key={r.id} className="rounded-lg border border-border p-2 text-xs">
              <div className="flex items-center justify-between">
                <span>₹{r.amount} · <span className="uppercase text-muted-foreground">{r.status}</span></span>
                <span className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {r.status === "pending" && (
                <div className="mt-2 flex gap-1">
                  <button
                    onClick={async () => { try { await decideWithdrawal({ data: { request_id: r.id, approve: true } }); toast.success("Approved"); load(); } catch (e: any) { toast.error(e.message); } }}
                    className="flex-1 rounded bg-emerald-600 px-2 py-1 text-white"
                  ><Check className="inline h-3 w-3 mr-1" />Approve & debit</button>
                  <button
                    onClick={async () => { try { await decideWithdrawal({ data: { request_id: r.id, approve: false } }); toast.success("Rejected"); load(); } catch (e: any) { toast.error(e.message); } }}
                    className="flex-1 rounded bg-rose-600 px-2 py-1 text-white"
                  ><XCircle className="inline h-3 w-3 mr-1" />Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <h4 className="mt-4 text-sm font-bold">Ledger</h4>
        {txns.length === 0 && <p className="text-xs text-muted-foreground">No transactions yet.</p>}
        <div className="flex flex-col gap-1">
          {txns.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-2 py-1.5 text-xs">
              <div>
                <div className="font-medium capitalize">{t.type}</div>
                <div className="text-[10px] text-muted-foreground">{t.note || "—"} · {new Date(t.created_at).toLocaleDateString()}</div>
              </div>
              <div className="text-right">
                <div className={cn("font-bold", Number(t.amount) >= 0 ? "text-emerald-600" : "text-rose-600")}>
                  {Number(t.amount) >= 0 ? "+" : ""}{Number(t.amount).toFixed(2)}
                </div>
                <div className="text-[10px] text-muted-foreground">Bal: ₹{Number(t.balance_after).toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
