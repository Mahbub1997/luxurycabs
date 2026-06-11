import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MapPin, Phone, KeyRound, CheckCircle2, Banknote, Wallet, CreditCard, Loader2, Navigation, Clock as ClockIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { completeRide } from "@/lib/driver.functions";
import { computeRoute } from "@/lib/maps/routes.functions";
import { RouteMap } from "@/components/RouteMap";
import { simulateDrive, type LatLng } from "@/lib/maps/sim";
import { beep, ensureNotifyPermission, notify } from "@/lib/notify";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/driver/trip/$id")({
  head: () => ({ meta: [{ title: "Trip — Luxury Cabs Driver" }] }),
  component: DriverTrip,
});

type Phase = "to_pickup" | "otp" | "in_trip" | "payment";

function DriverTrip() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [b, setB] = useState<any | null>(null);
  const [phase, setPhase] = useState<Phase>("to_pickup");
  const [otp, setOtp] = useState("");
  const [pay, setPay] = useState<"cash" | "upi" | "card">("cash");
  const [busy, setBusy] = useState(false);

  // Live driver position + ETA driven by sim.
  const [pos, setPos] = useState<LatLng | null>(null);
  const [poly, setPoly] = useState<string | null>(null);
  const [etaMin, setEtaMin] = useState<number | null>(null);
  const cancelSimRef = useRef<(() => void) | null>(null);
  const dbTickRef = useRef<number>(0);

  useEffect(() => { ensureNotifyPermission(); }, []);

  useEffect(() => {
    supabase.from("bookings").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setB(data);
      if (data?.status === "in_progress") setPhase("in_trip");
    });
  }, [id]);

  // Compute route + start sim for current phase.
  useEffect(() => {
    if (!b) return;
    if (phase !== "to_pickup" && phase !== "in_trip") return;
    cancelSimRef.current?.();
    const origin = phase === "to_pickup"
      ? { lat: b.driver_lat ?? b.pickup_lat, lng: b.driver_lng ?? b.pickup_lng }
      : { lat: b.pickup_lat, lng: b.pickup_lng };
    const dest = phase === "to_pickup"
      ? { lat: b.pickup_lat, lng: b.pickup_lng }
      : { lat: b.drop_lat, lng: b.drop_lng };

    setPos(origin);
    let cancelled = false;
    (async () => {
      try {
        const r = await computeRoute({ data: { origin, destination: dest } });
        if (cancelled) return;
        setPoly(r.polyline);
        const totalMin = Math.max(1, Math.round((r.durationSec ?? 600) / 60));
        setEtaMin(totalMin);
        // Compress to a manageable demo duration: 1 min real per 3 trip-min, min 30s, max 5min.
        const totalMs = Math.min(5 * 60 * 1000, Math.max(30 * 1000, totalMin * 20_000));
        const startedAt = Date.now();
        cancelSimRef.current = simulateDrive({
          polyline: r.polyline,
          totalMs,
          intervalMs: 2000,
          onTick: (p, progress) => {
            setPos(p);
            const remainingMs = totalMs - (Date.now() - startedAt);
            const remainingMin = Math.max(0, Math.round((remainingMs / totalMs) * totalMin));
            setEtaMin(remainingMin);
            // Push to DB every ~8s to update customer's live tracking.
            const now = Date.now();
            if (now - dbTickRef.current > 8000) {
              dbTickRef.current = now;
              supabase.from("bookings").update({ driver_lat: p.lat, driver_lng: p.lng }).eq("id", b.id).then(() => {});
            }
            void progress;
          },
          onDone: () => {
            beep(500, 1040);
            setTimeout(() => beep(500, 1320), 250);
            if (phase === "to_pickup") {
              notify("Reached pickup 📍", "You have arrived at the customer's pickup point.");
              arrivedAtPickup();
            } else {
              notify("Reached drop ✅", "You have arrived at the drop location.");
              reachedDrop();
            }
          },
        });
      } catch {
        // ignore route errors; map will still render endpoints
      }
    })();
    return () => { cancelled = true; cancelSimRef.current?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, b?.id]);

  async function arrivedAtPickup() {
    if (!b) return;
    await supabase.from("bookings").update({ status: "driver_arrived", driver_lat: b.pickup_lat, driver_lng: b.pickup_lng }).eq("id", b.id);
    setPhase("otp");
  }

  async function verifyOtp() {
    if (!b) return;
    if (otp.trim() !== b.otp) { toast.error("Wrong OTP"); return; }
    await supabase.from("bookings").update({ status: "in_progress" }).eq("id", b.id);
    setPhase("in_trip");
    toast.success("Trip started");
  }

  async function reachedDrop() {
    if (!b) return;
    await supabase.from("bookings").update({ driver_lat: b.drop_lat, driver_lng: b.drop_lng }).eq("id", b.id);
    setPhase("payment");
  }

  async function collectAndComplete() {
    if (!b || busy) return;
    setBusy(true);
    try {
      const r = await completeRide({ data: { booking_id: b.id, payment_method: pay } });
      toast.success(`Trip complete. ₹${r.credit} credited.`);
      navigate({ to: "/driver" });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  if (!b) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const mapPickup = { lat: b.pickup_lat, lng: b.pickup_lng };
  const mapDrop = { lat: b.drop_lat, lng: b.drop_lng };
  const showMap = phase === "to_pickup" || phase === "in_trip";
  const mapEndpoints = phase === "in_trip"
    ? { pickup: mapPickup, drop: mapDrop }
    : { pickup: pos ?? mapPickup, drop: mapPickup };
  const destLabel = phase === "in_trip" ? "drop" : "pickup";

  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-card px-3 py-3">
        <Link to="/driver" className="rounded-full p-2 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <div className="font-bold">Active Trip</div>
          <div className="text-[11px] text-muted-foreground">OTP {b.otp}</div>
        </div>
        {etaMin !== null && showMap && (
          <div className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">
            <ClockIcon className="h-3 w-3" /> {etaMin} min
          </div>
        )}
      </header>

      <div className="p-4 space-y-3">
        {showMap && (
          <div className="overflow-hidden rounded-2xl border border-border">
            <RouteMap
              pickup={mapEndpoints.pickup}
              drop={mapEndpoints.drop}
              polyline={poly}
              driver={pos}
              height={280}
            />
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-3 text-sm">
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-emerald-600" /><div><div className="text-[10px] uppercase text-muted-foreground">Pickup</div><div className="font-semibold">{b.pickup_address}</div></div></div>
          <div className="my-2 ml-2 h-4 w-px border-l-2 border-dashed border-muted-foreground/40" />
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-rose-600" /><div><div className="text-[10px] uppercase text-muted-foreground">Drop</div><div className="font-semibold">{b.drop_address}</div></div></div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <span>{b.trip_type} · {Number(b.distance_km).toFixed(1)} km</span>
            <span className="font-bold">₹{b.fare}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3 text-sm flex items-center gap-3">
          <div className="font-bold flex-1">Customer</div>
          <a href="tel:+91" className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"><Phone className="h-4 w-4" /></a>
        </div>

        {phase === "to_pickup" && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Navigation className="h-4 w-4 text-primary" /> Drive to {destLabel}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Live tracking is on. You'll get a sound alert on arrival.</p>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${b.pickup_lat},${b.pickup_lng}`}
              target="_blank" rel="noreferrer"
              className="mt-3 block rounded-xl bg-primary py-3 text-center text-sm font-bold text-primary-foreground"
            >Open in Google Maps</a>
            <button onClick={arrivedAtPickup} className="mt-2 w-full rounded-xl border-2 border-primary py-3 text-sm font-bold text-primary">I have arrived</button>
          </div>
        )}

        {phase === "otp" && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Enter customer OTP</div>
            <input
              inputMode="numeric" maxLength={4} value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              className="mt-3 w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-primary"
              placeholder="••••"
            />
            <button
              onClick={verifyOtp} disabled={otp.length !== 4}
              className={cn("mt-3 w-full rounded-xl py-3 text-sm font-bold",
                otp.length === 4 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}
            >Start Trip</button>
          </div>
        )}

        {phase === "in_trip" && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Navigation className="h-4 w-4 text-primary" /> Drive to drop</div>
            <p className="mt-1 text-[11px] text-muted-foreground">Live tracking is on. You'll get a sound alert on arrival.</p>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${b.drop_lat},${b.drop_lng}`}
              target="_blank" rel="noreferrer"
              className="mt-3 block rounded-xl bg-primary py-3 text-center text-sm font-bold text-primary-foreground"
            >Open in Google Maps</a>
            <button onClick={reachedDrop} className="mt-2 w-full rounded-xl border-2 border-primary py-3 text-sm font-bold text-primary">Reached drop</button>
          </div>
        )}

        {phase === "payment" && (
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="text-sm font-semibold">Collect payment</div>
            <div className="mt-2 text-2xl font-bold text-primary">₹{b.fare}</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { id: "cash" as const, I: Banknote, l: "Cash" },
                { id: "upi" as const, I: Wallet, l: "UPI" },
                { id: "card" as const, I: CreditCard, l: "Card" },
              ].map(({ id, I, l }) => (
                <button key={id} onClick={() => setPay(id)} className={cn("flex flex-col items-center gap-1 rounded-xl border-2 bg-card p-3 text-xs font-semibold",
                  pay === id ? "border-foreground" : "border-border text-muted-foreground")}>
                  <I className="h-5 w-5" />{l}
                </button>
              ))}
            </div>
            <button onClick={collectAndComplete} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Complete trip</>}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">10% platform commission will be deducted from your wallet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
