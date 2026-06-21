import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Booking } from "@/lib/booking-store";
import {
  ensureInvoiceFor,
  downloadInvoice,
  deleteInvoiceFor,
  uploadInvoiceFor,
  shareInvoiceWhatsApp,
  shareInvoiceEmail,
} from "@/lib/invoice-storage";
import {
  Search,
  FileText,
  Download,
  Share2,
  RefreshCw,
  Trash2,
  Loader2,
  Eye,
  MessageCircle,
  Mail,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/invoices")({
  component: AdminInvoices,
});

type Row = Booking & { invoice_url?: string | null; invoice_path?: string | null; invoice_generated_at?: string | null };

function AdminInvoices() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<Row | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const fromTs = from ? new Date(from).getTime() : 0;
    const toTs = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 : Infinity;
    return rows.filter((r) => {
      const t = new Date(r.completed_at ?? r.scheduled_at).getTime();
      if (t < fromTs || t > toTs) return false;
      if (!term) return true;
      const hay = [
        r.id,
        r.customer_name,
        r.customer_phone,
        r.driver_name,
        r.pickup_address,
        r.drop_address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, q, from, to]);

  async function act(row: Row, key: string, fn: () => Promise<any>) {
    setBusy(row.id + key);
    try {
      await fn();
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-base font-bold">Invoices</h2>
        <p className="text-xs text-muted-foreground">Auto-generated PDFs for every completed trip.</p>
      </div>

      <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search customer, trip ID, driver, address…"
            className="w-full bg-transparent py-2 text-xs outline-none"
          />
        </div>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs" />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No invoices match.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((r) => {
            const date = new Date(r.completed_at ?? r.scheduled_at);
            const tripCode = r.id.slice(0, 8).toUpperCase();
            const k = (s: string) => busy === r.id + s;
            return (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-3 text-xs shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="font-bold">#{tripCode}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {r.trip_type}
                      </span>
                      {r.invoice_path ? (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium text-primary">Saved</span>
                      ) : (
                        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-800">Not generated</span>
                      )}
                    </div>
                    <div className="mt-1 truncate font-medium">{r.customer_name ?? "Customer"} · {r.customer_phone ?? "—"}</div>
                    <div className="truncate text-muted-foreground">{r.pickup_address} → {r.drop_address}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                      <span>{date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                      <span>{Number(r.distance_km).toFixed(1)} km</span>
                      <span>{r.duration_min} min</span>
                      <span className="font-semibold text-foreground">₹{Number(r.fare).toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  <IconBtn
                    label="View"
                    Icon={Eye}
                    busy={k("view")}
                    onClick={() => act(r, "view", async () => {
                      const url = await ensureInvoiceFor(r);
                      window.open(url, "_blank");
                    })}
                  />
                  <IconBtn
                    label="Download"
                    Icon={Download}
                    busy={k("dl")}
                    onClick={() => act(r, "dl", () => downloadInvoice(r))}
                  />
                  <IconBtn
                    label="Share"
                    Icon={Share2}
                    busy={k("sh")}
                    onClick={() => act(r, "sh", async () => {
                      await ensureInvoiceFor(r);
                      setShareFor(r);
                    })}
                  />
                  <IconBtn
                    label="Regenerate"
                    Icon={RefreshCw}
                    busy={k("re")}
                    onClick={() => act(r, "re", async () => {
                      await uploadInvoiceFor(r);
                      toast.success("Regenerated");
                    })}
                  />
                  <IconBtn
                    label="Delete"
                    Icon={Trash2}
                    danger
                    busy={k("del")}
                    onClick={() => {
                      if (!confirm("Delete this invoice file? Trip data is kept.")) return;
                      return act(r, "del", () => deleteInvoiceFor(r));
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {shareFor && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center" onClick={() => setShareFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-t-2xl bg-card p-4 sm:rounded-2xl">
            <div className="mb-3 text-sm font-bold">Share invoice</div>
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => {
                  const url = await ensureInvoiceFor(shareFor);
                  shareInvoiceWhatsApp(url, shareFor);
                  setShareFor(null);
                }}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm"
              >
                <MessageCircle className="h-4 w-4 text-green-600" /> WhatsApp
              </button>
              <button
                onClick={async () => {
                  const url = await ensureInvoiceFor(shareFor);
                  shareInvoiceEmail(url, shareFor);
                  setShareFor(null);
                }}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm"
              >
                <Mail className="h-4 w-4 text-primary" /> Email
              </button>
              <button
                onClick={async () => {
                  const url = await ensureInvoiceFor(shareFor);
                  await navigator.clipboard.writeText(url);
                  toast.success("Link copied");
                  setShareFor(null);
                }}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm"
              >
                <Share2 className="h-4 w-4" /> Copy link
              </button>
            </div>
            <button onClick={() => setShareFor(null)} className="mt-3 w-full rounded-xl bg-muted py-2 text-xs text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  label, Icon, onClick, busy, danger,
}: { label: string; Icon: any; onClick: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={
        "flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-[10px] font-medium disabled:opacity-50 " +
        (danger
          ? "border-destructive/40 text-destructive hover:bg-destructive/10"
          : "border-border text-foreground hover:bg-muted")
      }
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
