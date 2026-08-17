import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Booking } from "@/lib/booking-store";
import {
  ensureInvoiceFor,
  downloadInvoice,
  deleteInvoiceFor,
  uploadInvoiceFor,
  invoiceIsCurrent,
  shareInvoice,
  shareInvoiceWhatsApp,
  shareInvoiceEmail,

} from "@/lib/invoice-storage";
import { invoiceFolder } from "@/lib/invoice";
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
  FolderOpen,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { formatDuration } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/invoices")({
  head: () => ({
    meta: [
      { title: "Monthly Invoices — Luxury Cabs Admin" },
      { name: "description", content: "Manage completed-trip invoices organized in monthly folders." },
      { property: "og:title", content: "Monthly Invoices — Luxury Cabs Admin" },
      { property: "og:description", content: "Manage completed-trip invoices organized in monthly folders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
  const [autoSaving, setAutoSaving] = useState<{ done: number; total: number } | null>(null);
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const autoRan = useRef(false);

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
    return (data ?? []) as Row[];
  }

  /** Generate/migrate every completed trip's invoice into YYYY/Mon/invoice/ and drop old files. */
  async function autoSaveAll(list: Row[], silent = false) {
    const pending = list.filter((r) => !invoiceIsCurrent(r));
    if (pending.length === 0) {
      if (!silent) toast.success("All invoices are already saved");
      return;
    }
    setAutoSaving({ done: 0, total: pending.length });
    let done = 0;
    for (const r of pending) {
      try {
        await uploadInvoiceFor(r);
      } catch { /* keep going */ }
      done += 1;
      setAutoSaving({ done, total: pending.length });
    }
    setAutoSaving(null);
    toast.success(`Saved ${done} invoice${done === 1 ? "" : "s"}`);
    await load();
  }

  useEffect(() => {
    (async () => {
      const list = await load();
      if (autoRan.current) return;
      autoRan.current = true;
      await autoSaveAll(list, true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const folders = useMemo(() => {
    const grouped = new Map<string, { folder: ReturnType<typeof invoiceFolder>; rows: Row[] }>();
    for (const row of filtered) {
      const folder = invoiceFolder(row);
      const existing = grouped.get(folder.label);
      if (existing) existing.rows.push(row);
      else grouped.set(folder.label, { folder, rows: [row] });
    }
    return Array.from(grouped.values());
  }, [filtered]);

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
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-bold">Invoices</h2>
          <p className="text-xs text-muted-foreground">
            Auto-saved to <span className="font-medium">Year / Month / invoice</span> (e.g. 2026 / Jan / invoice) for every completed trip.
          </p>
        </div>
        <button
          onClick={() => autoSaveAll(rows)}
          disabled={!!autoSaving}
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[11px] font-semibold disabled:opacity-60"
        >
          {autoSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {autoSaving ? `Saving ${autoSaving.done}/${autoSaving.total}` : "Auto-save all"}
        </button>
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
          {folders.map(({ folder, rows: monthRows }) => {
            const isOpen = openFolder === folder.label;
            return (
              <section key={folder.label} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpenFolder(isOpen ? null : folder.label)}
                  className="h-auto w-full justify-start rounded-none px-4 py-4 text-left hover:bg-muted"
                >
                  <FolderOpen className="h-5 w-5 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{folder.month} {folder.year}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">{monthRows.length} invoice{monthRows.length === 1 ? "" : "s"}</span>
                  </span>
                  <ChevronRight className={isOpen ? "h-4 w-4 rotate-90 transition-transform" : "h-4 w-4 transition-transform"} />
                </Button>
                {isOpen && <div className="space-y-2 border-t border-border bg-muted/30 p-2 animate-fade-in">
                {monthRows.map((r) => {
                  const date = new Date(r.completed_at ?? r.scheduled_at);
                  const tripCode = r.id.slice(0, 8).toUpperCase();
                  const k = (s: string) => busy === r.id + s;
                  return (
              <div className="rounded-2xl border border-border bg-card p-3 text-xs shadow-sm">
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
                      <span>{formatDuration(r.duration_min)}</span>
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
                </div>}
              </section>
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
                  try {
                    const res = await shareInvoice(shareFor);
                    if (res === "copied") toast.success("Link copied — sharing files isn't supported here");
                    else if (res === "file") toast.success("Invoice PDF shared");
                  } catch (e: any) {
                    toast.error(e?.message ?? "Share failed");
                  }
                  setShareFor(null);
                }}
                className="flex items-center gap-2 rounded-xl border border-primary bg-primary-soft px-3 py-2.5 text-sm font-semibold text-primary"
              >
                <FileText className="h-4 w-4" /> Share PDF file
              </button>
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
