import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn, formatDuration, formatDateTime12 } from "@/lib/utils";

export const Route = createFileRoute("/driver/bookings")({
  head: () => ({ meta: [{ title: "My Bookings — Driver" }] }),
  component: DriverBookings,
});

const TABS = ["ongoing", "completed", "all"] as const;
type Tab = (typeof TABS)[number];

function DriverBookings() {
  const [tab, setTab] = useState<Tab>("ongoing");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<Tab, number>>({ ongoing: 0, completed: 0, all: 0 });
  const [driverId, setDriverId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: d } = await supabase.from("drivers").select("id").eq("user_id", u.user.id).maybeSingle();
      setDriverId(d?.id ?? null);
    })();
  }, []);

  async function loadCounts(id: string) {
    const head = (opts: (q: any) => any) => {
      const q = supabase.from("bookings").select("id", { count: "exact", head: true }).eq("assigned_driver_id", id);
      return opts(q).then((r: any) => r.count ?? 0);
    };
    const [ongoing, completed, all] = await Promise.all([
      head((q) => q.in("status", ["driver_assigned", "driver_arrived", "in_progress"])),
      head((q) => q.in("status", ["completed", "cancelled"])),
      head((q) => q),
    ]);
    setCounts({ ongoing, completed, all });
  }

  useEffect(() => {
    if (!driverId) return;
    (async () => {
      setLoading(true);
      let q = supabase.from("bookings").select("*").eq("assigned_driver_id", driverId).order("created_at", { ascending: false }).limit(100);
      if (tab === "ongoing") q = q.in("status", ["driver_assigned", "driver_arrived", "in_progress"]);
      else if (tab === "completed") q = q.in("status", ["completed", "cancelled"]);
      const { data } = await q;
      setRows(data ?? []);
      setLoading(false);
    })();
    loadCounts(driverId);
    const ch = supabase.channel(`driver-bookings:${driverId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `assigned_driver_id=eq.${driverId}` },
        () => { loadCounts(driverId); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tab, driverId]);

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3 py-3">
        <Link to="/driver" className="rounded-full p-2"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="font-bold">My Bookings</div>
      </header>
      <div className="p-3">
        <div className="mb-3 flex gap-1">
          {TABS.map((t) => {
            const c = counts[t];
            const active = tab === t;
            const badgeColor =
              t === "ongoing" ? "bg-emerald-500" :
              t === "completed" ? "bg-slate-500" : "bg-primary";
            return (
              <button key={t} onClick={() => setTab(t)} className={cn(
                "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium capitalize",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
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
        {loading && <Loader2 className="h-5 w-5 animate-spin" />}
        {!loading && rows.length === 0 && <p className="text-sm text-muted-foreground">No bookings.</p>}
        <div className="flex flex-col gap-2">
          {rows.map((b) => (
            <Link key={b.id} to="/driver/trip/$id" params={{ id: b.id }} className="block rounded-2xl border border-border bg-card p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">{b.status}</span>
                <span className="text-[10px] text-muted-foreground">{formatDateTime12(new Date(b.created_at))}</span>
              </div>
              <div className="mt-2 space-y-1">
                <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 text-emerald-600" /><span className="text-xs">{b.pickup_address}</span></div>
                <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 text-rose-600" /><span className="text-xs">{b.drop_address}</span></div>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span>{Number(b.distance_km).toFixed(1)} km · {formatDuration(b.duration_min)}</span>
                <span className="font-bold">₹{b.fare}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
