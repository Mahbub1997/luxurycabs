import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, User, Car, IndianRupee, CreditCard, Clock, UserPlus, X, Loader2, Search, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { listApprovedDrivers } from "@/lib/admin.functions";
import { assignBookingToDriver } from "@/lib/driver.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/bookings")({
  component: AdminBookings,
});


const TABS = ["pending", "ongoing", "completed", "all"] as const;
type Tab = (typeof TABS)[number];

function AdminBookings() {
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    let q = supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(200);
    if (tab === "pending") q = q.in("status", ["pending"]);
    else if (tab === "ongoing") q = q.in("status", ["driver_assigned", "driver_arrived", "in_progress"]);
    else if (tab === "completed") q = q.in("status", ["completed", "cancelled"]);
    const { data } = await q;
    setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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
      </div>

      <div className="mb-3 flex gap-1">
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


function BookingCard({ b }: { b: any }) {
  const [assigning, setAssigning] = useState(false);
  const statusColor =

    b.status === "completed" ? "bg-emerald-100 text-emerald-700"
    : b.status === "cancelled" ? "bg-rose-100 text-rose-700"
    : b.status === "pending" ? "bg-amber-100 text-amber-700"
    : "bg-sky-100 text-sky-700";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-sm shadow-sm">
      <div className="flex items-center justify-between">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", statusColor)}>
          {b.status}
        </span>
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
        <Mini label="Duration" value={`${b.duration_min} min`} />
        <Mini label="Fare" value={`₹${b.fare}`} Icon={IndianRupee} />
        <Mini label="Pay" value={`${b.payment_method} · ${b.payment_status}`} Icon={CreditCard} />
      </div>

      {(b.driver_name || b.assigned_driver_id) && (
        <div className="mt-3 rounded-lg bg-muted/50 p-2.5 text-xs">
          <div className="mb-1 flex items-center gap-1 font-semibold text-foreground">
            <Car className="h-3.5 w-3.5" /> Driver
          </div>
          <div className="text-muted-foreground">
            {b.driver_name || b.assigned_driver_id} {b.driver_phone && `· ${b.driver_phone}`}
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

      {(b.status === "pending" || !b.assigned_driver_id) && b.status !== "completed" && b.status !== "cancelled" && (
        <button
          onClick={() => setAssigning(true)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-xs font-bold text-primary-foreground"
        >
          <UserPlus className="h-3.5 w-3.5" /> {b.assigned_driver_id ? "Reassign Driver" : "Assign Driver"}
        </button>
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
