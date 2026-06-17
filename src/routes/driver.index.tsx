import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { LogOut, Wallet, ClipboardList, Power, MapPin, Clock, Car, Loader2 } from "lucide-react";
import { CredoomWordmark } from "@/components/Brand";
import { supabase } from "@/integrations/supabase/client";
import { acceptRide, rejectRide } from "@/lib/driver.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";

export const Route = createFileRoute("/driver/")({
  head: () => ({ meta: [{ title: "Driver — Luxury Cabs" }] }),
  component: DriverHome,
});

/** Looping ringtone for incoming ride. Two-tone beep every ~1.2s. */
function startRingtone(): () => void {
  let stopped = false;
  let ctx: AudioContext | null = null;
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch { return () => {}; }

  function tone(freq: number, t0: number, dur = 0.35) {
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function ring() {
    if (stopped || !ctx) return;
    const t = ctx.currentTime;
    tone(880, t);
    tone(660, t + 0.4);
    try { if ("vibrate" in navigator) (navigator as any).vibrate([300, 100, 300]); } catch {}
  }
  ring();
  const id = window.setInterval(ring, 1200);

  return () => {
    stopped = true;
    clearInterval(id);
    try { ctx?.close(); } catch {}
    try { if ("vibrate" in navigator) (navigator as any).vibrate(0); } catch {}
  };
}

function DriverHome() {
  const navigate = useNavigate();
  const [driver, setDriver] = useState<any | null>(null);
  const [incoming, setIncoming] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const seenRef = useRef<Set<string>>(new Set());

  async function loadDriver(uid: string) {
    const { data } = await supabase.from("drivers").select("*").eq("user_id", uid).maybeSingle();
    setDriver(data);
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { navigate({ to: "/driver/login", replace: true }); return; }
      await loadDriver(data.user.id);
    })();
  }, [navigate]);

  useEffect(() => {
    if (!driver?.id) return;
    const ch = supabase
      .channel(`driver-${driver.id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `assigned_driver_id=eq.${driver.id}` },
        (p) => {
          const row: any = p.new;
          if (row.status === "driver_assigned" && !seenRef.current.has(row.id)) {
            seenRef.current.add(row.id);
            setIncoming(row);
          }
        })
      .subscribe();

    (async () => {
      const { data } = await supabase.from("bookings").select("*").eq("assigned_driver_id", driver.id).in("status", ["driver_assigned"]).order("created_at", { ascending: false }).limit(1);
      if (data && data[0]) { setIncoming(data[0]); }
      const { data: active } = await supabase.from("bookings").select("id").eq("assigned_driver_id", driver.id).in("status", ["driver_arrived", "in_progress"]).limit(1);
      if (active && active[0]) navigate({ to: "/driver/trip/$id", params: { id: active[0].id } });
    })();

    return () => { supabase.removeChannel(ch); };
  }, [driver?.id, navigate]);

  // Continuous GPS broadcast while online
  useEffect(() => {
    if (!driver?.id || !driver.is_online) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastSent < 4000) return; // throttle to once / 4s
        lastSent = now;
        await supabase.from("drivers").update({
          current_lat: pos.coords.latitude,
          current_lng: pos.coords.longitude,
          location_updated_at: new Date().toISOString(),
        }).eq("id", driver.id);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [driver?.id, driver?.is_online]);

  async function toggleOnline() {
    if (!driver) return;
    const next = !driver.is_online;
    await supabase.from("drivers").update({ is_online: next }).eq("id", driver.id);
    setDriver({ ...driver, is_online: next });
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/driver/login", replace: true });
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!driver) {
    return (
      <div className="min-h-screen grid place-items-center p-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground">No driver profile found.</p>
          <Link to="/driver/signup" className="mt-3 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Register as driver</Link>
        </div>
      </div>
    );
  }

  const statusColor =
    driver.status === "approved" ? "bg-emerald-100 text-emerald-700"
    : driver.status === "pending" ? "bg-amber-100 text-amber-700"
    : "bg-rose-100 text-rose-700";

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-primary">
          <CredoomWordmark label="Luxury Cabs Driver" />
        </div>
        <button onClick={signOut} className="flex items-center gap-1 text-xs text-muted-foreground"><LogOut className="h-4 w-4" /> Sign out</button>
      </header>

      <div className="p-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold">{driver.name}</div>
              <div className="text-xs text-muted-foreground">{driver.phone}</div>
              <div className="text-[11px] text-muted-foreground">{driver.vehicle_type} · {driver.vehicle_model || "—"} · {driver.vehicle_number || "—"}</div>
            </div>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", statusColor)}>{driver.status}</span>
          </div>

          {driver.status !== "approved" && (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              {driver.status === "pending" ? "Awaiting admin approval. You will be notified once approved." : "Your account is not active. Contact admin."}
            </div>
          )}

          {driver.status === "approved" && (
            <button
              onClick={toggleOnline}
              className={cn(
                "mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold",
                driver.is_online ? "bg-emerald-600 text-white" : "bg-muted text-foreground"
              )}
            >
              <Power className="h-4 w-4" /> {driver.is_online ? "ONLINE — Tap to go offline" : "OFFLINE — Tap to go online"}
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <NavCard to="/driver/bookings" Icon={ClipboardList} label="My Bookings" />
          <NavCard to="/driver/wallet" Icon={Wallet} label={`Wallet ₹${Number(driver.wallet_balance).toFixed(0)}`} />
        </div>

        {!incoming && driver.status === "approved" && driver.is_online && (
          <div className="mt-6 rounded-2xl border-2 border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            <Clock className="mx-auto mb-2 h-6 w-6 text-primary" />
            Waiting for ride assignment…
          </div>
        )}
      </div>

      {incoming && <IncomingModal booking={incoming} onAccept={async () => {
        try {
          await acceptRide({ data: { booking_id: incoming.id } });
          const id = incoming.id;
          setIncoming(null);
          navigate({ to: "/driver/trip/$id", params: { id } });
        } catch (e: any) { toast.error(e.message); }
      }} onReject={async () => {
        try {
          await rejectRide({ data: { booking_id: incoming.id } });
          setIncoming(null);
          toast.message("Ride rejected");
        } catch (e: any) { toast.error(e.message); }
      }} />}
    </div>
  );
}

function NavCard({ to, Icon, label }: { to: string; Icon: any; label: string }) {
  return (
    <Link to={to} className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-card p-4 text-xs font-semibold">
      <Icon className="h-5 w-5 text-primary" />
      {label}
    </Link>
  );
}

function IncomingModal({ booking, onAccept, onReject }: { booking: any; onAccept: () => void; onReject: () => void }) {
  const [remaining, setRemaining] = useState(30);
  const stopRef = useRef<(() => void) | null>(null);
  const rejectedRef = useRef(false);

  useEffect(() => {
    stopRef.current = startRingtone();
    const interval = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(interval);
          if (!rejectedRef.current) {
            rejectedRef.current = true;
            stopRef.current?.();
            onReject();
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(interval);
      stopRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAccept = () => {
    rejectedRef.current = true;
    stopRef.current?.();
    onAccept();
  };
  const handleReject = () => {
    rejectedRef.current = true;
    stopRef.current?.();
    onReject();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl animate-in slide-in-from-bottom">
        <div className="flex items-center justify-between text-primary">
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 animate-pulse" />
            <span className="font-bold uppercase tracking-wide">New Ride Request</span>
          </div>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">{remaining}s</span>
        </div>
        <div className="mt-3 space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 text-emerald-600" /><div><div className="text-[10px] uppercase text-muted-foreground">Pickup</div><div className="font-semibold">{booking.pickup_address}</div></div></div>
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 text-rose-600" /><div><div className="text-[10px] uppercase text-muted-foreground">Drop</div><div className="font-semibold">{booking.drop_address}</div></div></div>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span>{booking.trip_type} · {Number(booking.distance_km).toFixed(1)} km</span>
          <span className="font-bold text-primary">₹{booking.fare}</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={handleReject} className="rounded-xl bg-rose-600 py-3 text-sm font-bold text-white">Reject</button>
          <button onClick={handleAccept} className="rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white">Accept</button>
        </div>
      </div>
    </div>
  );
}
