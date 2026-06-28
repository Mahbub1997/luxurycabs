import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Loader2, Car, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { acceptRide, rejectRide } from "@/lib/driver.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/driver/requests")({
  head: () => ({ meta: [{ title: "Ride Requests — Luxury Cabs Driver" }] }),
  component: DriverRequests,
});

function DriverRequests() {
  const navigate = useNavigate();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [rejected, setRejected] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { navigate({ to: "/driver/login", replace: true }); return; }
      const { data: drv } = await supabase.from("drivers").select("id").eq("user_id", auth.user.id).maybeSingle();
      if (!drv) { setLoading(false); return; }
      setDriverId(drv.id);
    })();
  }, [navigate]);

  async function load(id: string) {
    setLoading(true);
    const [{ data: pending }, { data: rej }] = await Promise.all([
      supabase.from("bookings").select("*")
        .eq("assigned_driver_id", id).eq("status", "driver_offered")
        .order("created_at", { ascending: false }),
      supabase.from("bookings").select("*")
        .contains("rejected_driver_ids" as any, [id] as any)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    setRows(pending ?? []);
    setRejected(rej ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (!driverId) return;
    load(driverId);
    const ch = supabase.channel(`driver-req-${driverId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => load(driverId))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [driverId]);

  async function onAccept(id: string) {
    setBusyId(id);
    try {
      await acceptRide({ data: { booking_id: id } });
      toast.success("Ride accepted");
      navigate({ to: "/driver/trip/$id", params: { id } });
    } catch (e: any) { toast.error(e.message); setBusyId(null); }
  }
  async function onReject(id: string) {
    setBusyId(id);
    try {
      await rejectRide({ data: { booking_id: id } });
      toast.message("Ride rejected");
    } catch (e: any) { toast.error(e.message); }
    finally { setBusyId(null); }
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-card px-3 py-3">
        <Link to="/driver" className="rounded-full p-2 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="font-bold">Ride Requests</div>
      </header>

      <div className="p-4 space-y-3">
        {loading && <div className="grid place-items-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
        {!loading && rows.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <Car className="mx-auto mb-2 h-6 w-6 text-primary" />
            No pending ride requests.
          </div>
        )}
        {rows.map((b) => (
          <div key={b.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold">{b.trip_type} · {Number(b.distance_km).toFixed(1)} km</div>
              <div className="text-lg font-extrabold text-primary">₹{b.fare}</div>
            </div>
            <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase text-muted-foreground">Pickup</div>
                  <div className="font-semibold">{b.pickup_address}</div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-rose-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase text-muted-foreground">Drop</div>
                  <div className="font-semibold">{b.drop_address}</div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={busyId === b.id}
                onClick={() => onReject(b.id)}
                className="rounded-xl bg-rose-600 py-3 text-sm font-bold text-white disabled:opacity-50"
              >Reject</button>
              <button
                disabled={busyId === b.id}
                onClick={() => onAccept(b.id)}
                className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50"
              >Accept</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
