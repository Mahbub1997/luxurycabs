import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RouteMap } from "@/components/RouteMap";
import { MapPin, Phone, User, Car, Activity, Users as UsersIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/live")({
  component: AdminLive,
});

function AdminLive() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState<number>(0);
  const [totalUsers, setTotalUsers] = useState<number>(0);

  async function load() {
    const { data } = await supabase
      .from("bookings")
      .select("*")
      .in("status", ["driver_assigned", "driver_arrived", "in_progress"])
      .order("created_at", { ascending: false });
    setRows(data ?? []);
    setLoading(false);

    // Active users: distinct users with bookings in the last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("bookings")
      .select("user_id, customer_phone")
      .gte("created_at", since);
    const set = new Set<string>();
    (recent ?? []).forEach((r: any) => {
      const k = r.user_id || r.customer_phone;
      if (k) set.add(k);
    });
    setActiveUsers(set.size);

    const { data: all } = await supabase
      .from("bookings")
      .select("user_id, customer_phone");
    const setAll = new Set<string>();
    (all ?? []).forEach((r: any) => {
      const k = r.user_id || r.customer_phone;
      if (k) setAll.add(k);
    });
    setTotalUsers(setAll.size);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? rows[0] ?? null,
    [rows, selectedId]
  );

  if (loading) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard icon={<Activity className="h-4 w-4" />} label="Live Trips" value={rows.length} tone="emerald" />
        <StatCard icon={<UsersIcon className="h-4 w-4" />} label="Active 24h" value={activeUsers} tone="primary" />
        <StatCard icon={<User className="h-4 w-4" />} label="Total Users" value={totalUsers} tone="amber" />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No live trips right now.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[260px_1fr]">
          {/* Trip list */}
          <div className="space-y-2 max-h-[70vh] overflow-auto">
            {rows.map((b) => {
              const isSel = (selected?.id === b.id);
              return (
                <button
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  className={cn(
                    "w-full text-left rounded-xl border bg-card p-3 text-xs transition",
                    isSel ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">LC{(b.id as string).replace(/-/g, "").slice(0, 8).toUpperCase()}</span>
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="mt-1 truncate font-semibold">{b.customer_name ?? "—"}</div>
                  <div className="truncate text-muted-foreground">{b.driver_name ?? "Unassigned"} · {b.vehicle_type}</div>
                </button>
              );
            })}
          </div>

          {/* Map + details */}
          {selected && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl border border-border">
                <RouteMap
                  pickup={{ lat: selected.pickup_lat, lng: selected.pickup_lng }}
                  drop={{ lat: selected.drop_lat, lng: selected.drop_lng }}
                  polyline={selected.route_polyline}
                  driver={selected.driver_lat && selected.driver_lng ? { lat: selected.driver_lat, lng: selected.driver_lng } : null}
                  height={360}
                  fitKey={selected.id}
                />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <DetailCard
                  title="Customer"
                  icon={<User className="h-4 w-4" />}
                  name={selected.customer_name ?? "—"}
                  phone={selected.customer_phone}
                />
                <DetailCard
                  title="Driver"
                  icon={<Car className="h-4 w-4" />}
                  name={selected.driver_name ?? "Unassigned"}
                  phone={selected.driver_phone}
                />
              </div>
              <div className="rounded-2xl border border-border bg-card p-3 text-xs">
                <Row icon={<MapPin className="h-3.5 w-3.5 text-emerald-600" />} label="Pickup" value={selected.pickup_address} />
                <Row icon={<MapPin className="h-3.5 w-3.5 text-rose-600" />} label="Drop" value={selected.drop_address} />
                <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                  <span>{selected.trip_type} · {Number(selected.distance_km).toFixed(1)} km</span>
                  <span className="font-bold">₹{selected.fare}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "emerald" | "primary" | "amber" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    primary: "bg-primary-soft text-primary border-primary/30",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <div className={cn("rounded-xl border p-3", tones[tone])}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold opacity-80">{icon}{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    driver_assigned: "bg-blue-100 text-blue-700",
    driver_arrived: "bg-amber-100 text-amber-700",
    in_progress: "bg-emerald-100 text-emerald-700",
  };
  const label = status === "in_progress" ? "STARTED" : status.replace("_", " ").toUpperCase();
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", map[status] ?? "bg-muted")}>{label}</span>;
}

function DetailCard({ title, icon, name, phone }: { title: string; icon: React.ReactNode; name: string; phone?: string | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-xs">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">{icon}{title}</div>
      <div className="mt-1 font-bold">{name}</div>
      {phone && (
        <a href={`tel:${phone}`} className="mt-1 inline-flex items-center gap-1 text-primary">
          <Phone className="h-3 w-3" /> {phone}
        </a>
      )}
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
        <div className="truncate font-semibold">{value}</div>
      </div>
    </div>
  );
}
