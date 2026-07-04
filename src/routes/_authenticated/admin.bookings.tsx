import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  MapPin, User, Car, IndianRupee, CreditCard, Clock, UserPlus, X, Loader2,
  Search, Phone, XCircle, ChevronDown, ChevronUp, RefreshCw,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { listApprovedDrivers } from "@/lib/admin.functions";
import { assignBookingToDriver, cancelBookingServer, adminSetBookingStatus } from "@/lib/driver.functions";
import { CancelReasonModal } from "@/components/CancelReasonModal";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/bookings")({
  component: AdminBookings,
});

const TABS = ["offers", "pending", "ongoing", "rejected", "completed", "all"] as const;
type Tab = (typeof TABS)[number];

const STATUSES = [
  "pending", "driver_offered", "driver_assigned", "driver_arrived", "in_progress", "completed", "cancelled",
] as const;
type Status = (typeof STATUSES)[number];

function AdminBookings() {
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [counts, setCounts] = useState<Record<Tab, number>>({
    offers: 0, pending: 0, ongoing: 0, rejected: 0, completed: 0, all: 0,
  });

  async function load() {
    setLoading(true);
    let q = supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(200);
    if (tab === "offers") q = q.eq("status", "driver_offered");
    else if (tab === "pending") q = q.in("status", ["pending", "driver_offered"]);
    else if (tab === "ongoing") q = q.in("status", ["driver_assigned", "driver_arrived", "in_progress"]);
    else if (tab === "rejected") q = q.not("rejected_driver_ids" as any, "eq", "{}");
    else if (tab === "completed") q = q.in("status", ["completed", "cancelled"]);
    const { data } = await q;
    setRows(data ?? []);
    setLoading(false);
  }

  async function loadCounts() {
    const head = (opts: (q: any) => any) => {
      const q = supabase.from("bookings").select("id", { count: "exact", head: true });
      return opts(q).then((r: any) => r.count ?? 0);
    };
    const [offers, pending, ongoing, rejected, completed, all] = await Promise.all([
      head((q) => q.eq("status", "driver_offered")),
      head((q) => q.in("status", ["pending", "driver_offered"])),
      head((q) => q.in("status", ["driver_assigned", "driver_arrived", "in_progress"])),
      head((q) => q.not("rejected_driver_ids" as any, "eq", "{}")),
      head((q) => q.in("status", ["completed", "cancelled"])),
      head((q) => q),
    ]);
    setCounts({ offers, pending, ongoing, rejected, completed, all });
  }

  useEffect(() => {
    load();
    loadCounts();
    const ch = supabase
      .channel("admin-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => { load(); loadCounts(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const q = query.trim().toLowerCase();
  const filtered = !q ? rows : rows.filter((b) => {
    const code = `LC${(b.id as string).replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    return (
      (b.id as string).toLowerCase().includes(q) ||
      code.toLowerCase().includes(q) ||
      (b.customer_name ?? "").toLowerCase().includes(q) ||
      (b.customer_phone ?? "").toLowerCase().includes(q) ||
      (b.driver_name ?? "").toLowerCase().includes(q) ||
      (b.driver_phone ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by booking ID, customer name or phone"
          className="w-full bg-transparent text-sm outline-none"
        />
        {query && <button onClick={() => setQuery("")}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
        <button onClick={load} title="Refresh"><RefreshCw className="h-3.5 w-3.5 text-muted-foreground" /></button>
      </div>

      <div className="mb-3 flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const c = counts[t];
          const active = tab === t;
          const badgeColor =
            t === "pending" ? "bg-amber-500" :
            t === "ongoing" ? "bg-emerald-500" :
            t === "offers" ? "bg-sky-500" :
            t === "rejected" ? "bg-rose-500" :
            t === "completed" ? "bg-slate-500" : "bg-primary";
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium capitalize whitespace-nowrap",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {t}
              {c > 0 && (
                <span className={cn(
                  "grid min-h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold text-white",
                  badgeColor
                )}>{c > 99 ? "99+" : c}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No bookings.</p>
      )}

      <div className="flex flex-col gap-3">
        {filtered.map((b) => (
          <BookingCard key={b.id} b={b} />
        ))}
      </div>
    </div>
  );
}

function AssignModal({ booking, onClose }: { booking: any; onClose: () => void }) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  useEffect(() => {
    listApprovedDrivers().then(setDrivers).catch((e) => toast.error(e.message));
  }, []);
  async function assign(driver_id: string) {
    setBusyId(driver_id);
    try {
      await assignBookingToDriver({ data: { booking_id: booking.id, driver_id } });
      toast.success("Driver assigned");
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setBusyId(null); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-5 sm:rounded-3xl max-h-[80vh] overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">Assign Driver</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{booking.pickup_address} → {booking.drop_address}</p>
        <div className="flex flex-col gap-2">
          {drivers.length === 0 && <p className="text-sm text-muted-foreground">No approved drivers.</p>}
          {drivers.map((d) => (
            <button
              key={d.id}
              disabled={busyId === d.id}
              onClick={() => assign(d.id)}
              className="flex items-center justify-between rounded-xl border border-border bg-background p-3 text-left text-sm hover:bg-muted disabled:opacity-50"
            >
              <div>
                <div className="font-bold">{d.name} {d.is_online ? "🟢" : "⚫"}</div>
                <div className="text-xs text-muted-foreground">{d.phone} · {d.vehicle_type} · {d.vehicle_number || "—"}</div>
              </div>
              {busyId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed" ? "bg-emerald-100 text-emerald-700"
    : status === "cancelled" ? "bg-rose-100 text-rose-700"
    : status === "pending" ? "bg-amber-100 text-amber-700"
    : "bg-sky-100 text-sky-700";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", cls)}>
      {status}
    </span>
  );
}

function BookingCard({ b }: { b: any }) {
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [driverInfo, setDriverInfo] = useState<any>(null);

  const isActive = ["pending", "driver_offered", "driver_assigned", "driver_arrived", "in_progress"].includes(b.status);
  const isFinal = b.status === "completed" || b.status === "cancelled";

  useEffect(() => {
    if (!expanded || !b.assigned_driver_id || driverInfo) return;
    supabase.from("drivers")
      .select("id, name, phone, email, vehicle_type, vehicle_model, vehicle_number, rating, total_trips, wallet_balance, is_online, current_lat, current_lng, status")
      .eq("id", b.assigned_driver_id).maybeSingle()
      .then(({ data }) => setDriverInfo(data));
  }, [expanded, b.assigned_driver_id, driverInfo]);

  async function changeStatus(next: Status) {
    if (next === b.status) return;
    if (next === "cancelled") { setCancelling(true); return; }
    setSavingStatus(true);
    try {
      await adminSetBookingStatus({ data: { booking_id: b.id, status: next } });
      toast.success(`Status changed to ${next}`);
    } catch (e: any) { toast.error(e.message); } finally { setSavingStatus(false); }
  }

  const rejectedCount: number = Array.isArray(b.rejected_driver_ids) ? b.rejected_driver_ids.length : 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <StatusBadge status={b.status} />
          {rejectedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
              <XCircle className="h-3 w-3" /> {rejectedCount} rejected
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {new Date(b.created_at).toLocaleString()}
        </span>
      </div>

      <div className="mt-2 rounded-lg bg-muted/40 p-2 text-xs">
        <div className="mb-1 flex items-center gap-1 font-semibold text-foreground">
          <User className="h-3.5 w-3.5" /> Customer
        </div>
        <div className="text-muted-foreground">
          {b.customer_name || "—"}
          {b.customer_phone && (
            <a href={`tel:${b.customer_phone}`} className="ml-2 inline-flex items-center gap-1 text-primary">
              <Phone className="h-3 w-3" />{b.customer_phone}
            </a>
          )}
        </div>
      </div>

      <div className="mt-2 grid gap-1">
        <Row Icon={MapPin} text={b.pickup_address} accent="text-emerald-600" />
        <Row Icon={MapPin} text={b.drop_address} accent="text-rose-600" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Mini label="Trip" value={`${b.trip_type}${b.trip_mode ? " / " + b.trip_mode : ""}`} />
        <Mini label="Vehicle" value={b.vehicle_type} />
        <Mini label="Distance" value={`${b.distance_km} km`} />
        <Mini label="Duration" value={formatDuration(b.duration_min)} />
        <Mini label="Fare" value={`₹${b.fare}`} Icon={IndianRupee} />
        <Mini label="Pay" value={`${b.payment_method} · ${b.payment_status}`} Icon={CreditCard} />
      </div>

      {(b.driver_name || b.assigned_driver_id) && (
        <div className="mt-3 rounded-lg bg-muted/50 p-2.5 text-xs">
          <div className="mb-1 flex items-center gap-1 font-semibold text-foreground">
            <Car className="h-3.5 w-3.5" /> Assigned Driver
          </div>
          <div className="text-muted-foreground">
            {b.driver_name || b.assigned_driver_id}
            {b.driver_phone && (
              <a href={`tel:${b.driver_phone}`} className="ml-2 inline-flex items-center gap-1 text-primary">
                <Phone className="h-3 w-3" />{b.driver_phone}
              </a>
            )}
          </div>
          {(b.vehicle_model || b.vehicle_number) && (
            <div className="text-muted-foreground">
              {b.vehicle_model} {b.vehicle_number && `· ${b.vehicle_number}`}
            </div>
          )}
          {(b.driver_lat || b.driver_lng) && (
            <div className="mt-1 text-[10px] text-muted-foreground">
              Live: {b.driver_lat?.toFixed(4)}, {b.driver_lng?.toFixed(4)}
            </div>
          )}
        </div>
      )}

      {/* Status changer */}
      {!isFinal && (
        <div className="mt-3">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Change Status
          </label>
          <div className="flex items-center gap-2">
            <select
              value={b.status}
              disabled={savingStatus}
              onChange={(e) => changeStatus(e.target.value as Status)}
              className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            {savingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {(b.status === "pending" || !b.assigned_driver_id) && !isFinal && (
        <button
          onClick={() => setAssigning(true)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground"
        >
          <UserPlus className="h-3.5 w-3.5" /> {b.assigned_driver_id ? "Reassign Driver" : "Assign Driver"}
        </button>
      )}
      {b.assigned_driver_id && !isFinal && (
        <button
          onClick={() => setAssigning(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-bold"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reassign Driver
        </button>
      )}
      {isActive && (
        <button
          onClick={() => setCancelling(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-destructive/40 py-2 text-xs font-bold text-destructive"
        >
          <XCircle className="h-3.5 w-3.5" /> Cancel Trip
        </button>
      )}

      {b.status === "cancelled" && b.cancellation_reason && (
        <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[11px] text-rose-700">
          <span className="font-bold">Cancelled by {b.cancelled_by ?? "user"}:</span> {b.cancellation_reason}
        </div>
      )}

      {/* Expand for full details */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg bg-muted py-1.5 text-[11px] font-semibold text-muted-foreground"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {expanded ? "Hide details" : "Full details"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 rounded-xl border border-border bg-background p-3 text-xs">
          <Section title="Booking">
            <KV k="ID" v={b.id} />
            <KV k="Code" v={`LC${(b.id as string).replace(/-/g, "").slice(0, 8).toUpperCase()}`} />
            <KV k="OTP" v={b.otp} />
            <KV k="Scheduled" v={b.scheduled_at ? new Date(b.scheduled_at).toLocaleString() : "Now"} />
            <KV k="Created" v={new Date(b.created_at).toLocaleString()} />
            {b.completed_at && <KV k="Completed" v={new Date(b.completed_at).toLocaleString()} />}
            {b.user_id && <KV k="User" v={b.user_id} />}
          </Section>

          {b.assigned_driver_id && (
            <Section title="Driver (live)">
              {!driverInfo && <p className="text-muted-foreground">Loading…</p>}
              {driverInfo && (
                <>
                  <KV k="Name" v={driverInfo.name} />
                  <KV k="Phone" v={driverInfo.phone} />
                  <KV k="Email" v={driverInfo.email ?? "—"} />
                  <KV k="Vehicle" v={`${driverInfo.vehicle_type} · ${driverInfo.vehicle_model ?? "—"} · ${driverInfo.vehicle_number ?? "—"}`} />
                  <KV k="Online" v={driverInfo.is_online ? "🟢 Online" : "⚫ Offline"} />
                  <KV k="Rating" v={`${driverInfo.rating ?? "—"} ★ · ${driverInfo.total_trips ?? 0} trips`} />
                  <KV k="Wallet" v={`₹${driverInfo.wallet_balance ?? 0}`} />
                  <KV k="Status" v={driverInfo.status} />
                  {(driverInfo.current_lat || driverInfo.current_lng) && (
                    <KV k="Location" v={`${driverInfo.current_lat?.toFixed(5)}, ${driverInfo.current_lng?.toFixed(5)}`} />
                  )}
                </>
              )}
            </Section>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <User className="h-3 w-3" /> {b.id.slice(0, 8)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> OTP {b.otp}
        </span>
      </div>

      {assigning && <AssignModal booking={b} onClose={() => setAssigning(false)} />}
      {cancelling && (
        <CancelReasonModal
          title="Cancel this trip?"
          description="The customer will see this reason on their tracking screen."
          onCancel={() => setCancelling(false)}
          onConfirm={async (reason) => {
            try {
              await cancelBookingServer({ data: { booking_id: b.id, reason, by: "admin" } });
              toast.success("Trip cancelled");
              setCancelling(false);
            } catch (e: any) { toast.error(e.message); }
          }}
        />
      )}
    </div>
  );
}

function Row({ Icon, text, accent }: { Icon: any; text: string; accent?: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className={cn("mt-0.5 h-3.5 w-3.5 flex-shrink-0", accent)} />
      <span className="text-xs text-foreground">{text}</span>
    </div>
  );
}

function Mini({ label, value, Icon }: { label: string; value: string; Icon?: any }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-center gap-1 font-medium text-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {value}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="break-all text-right font-medium text-foreground">{String(v ?? "—")}</span>
    </div>
  );
}
