import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, User, Car, IndianRupee, CreditCard, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/bookings")({
  component: AdminBookings,
});

const TABS = ["pending", "ongoing", "completed", "all"] as const;
type Tab = (typeof TABS)[number];

function AdminBookings() {
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    let q = supabase.from("bookings").select("*").order("created_at", { ascending: false }).limit(200);
    if (tab === "pending") q = q.in("status", ["pending", "searching"]);
    else if (tab === "ongoing") q = q.in("status", ["accepted", "arriving", "in_progress", "started"]);
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

  return (
    <div>
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
      {!loading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No bookings.</p>
      )}

      <div className="flex flex-col gap-3">
        {rows.map((b) => (
          <BookingCard key={b.id} b={b} />
        ))}
      </div>
    </div>
  );
}

function BookingCard({ b }: { b: any }) {
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

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <User className="h-3 w-3" /> {b.id.slice(0, 8)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> OTP {b.otp}
        </span>
      </div>
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
