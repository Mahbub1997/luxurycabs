import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, MapPin, Phone, KeyRound, CheckCircle2, Banknote, Wallet, CreditCard, Loader2, Navigation, Clock as ClockIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { completeRide } from "@/lib/driver.functions";
import { computeRoute } from "@/lib/maps/routes.functions";
import { RouteMap } from "@/components/RouteMap";
type LatLng = { lat: number; lng: number };
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

  const [pos, setPos] = useState<LatLng | null>(null);
  const [poly, setPoly] = useState<string | null>(null);
  const [etaMin, setEtaMin] = useState<number | null>(null);
  const dbTickRef = useRef<number>(0);
  const arrivedRef = useRef(false);

  useEffect(() => { ensureNotifyPermission(); }, []);

  useEffect(() => {
    supabase.from("bookings").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setB(data);
      if (data?.status === "in_progress") setPhase("in_trip");
    });
  }, [id]);

  // Drive to PICKUP — REAL device GPS. Live-pushes to customer + admin.
  useEffect(() => {
    if (!b || phase !== "to_pickup") return;
    arrivedRef.current = false;

    // Draw planned driver→pickup route once.
    const origin0 = b.driver_lat && b.driver_lng ? { lat: b.driver_lat, lng: b.driver_lng } : null;
    const pickupPt = { lat: b.pickup_lat, lng: b.pickup_lng };
    if (origin0) setPos(origin0);
    (async () => {
      try {
        if (!origin0) return;
        const r = await computeRoute({ data: { origin: origin0, destination: pickupPt } });
        setPoly(r.polyline);
        setEtaMin(Math.max(1, Math.round(r.durationMin ?? 10)));
      } catch { /* ignore */ }
    })();

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      toast.error("GPS not available on this device");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (g) => {
        const p = { lat: g.coords.latitude, lng: g.coords.longitude };
        setPos(p);
        const now = Date.now();
        if (now - dbTickRef.current > 4000) {
          dbTickRef.current = now;
          supabase.from("bookings").update({ driver_lat: p.lat, driver_lng: p.lng }).eq("id", b.id).then(() => {});
        }
        const dKm = haversineKm(p, pickupPt);
        if (!arrivedRef.current && dKm < 0.12) {
          arrivedRef.current = true;
          beep(500, 1040);
          setTimeout(() => beep(500, 1320), 250);
          notify("Reached pickup 📍", "You have arrived at the customer's pickup point.");
          arrivedAtPickup();
        }
      },
      (err) => toast.error(err.message || "Unable to read GPS"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, b?.id]);

  // IN TRIP — REAL device GPS, no fake animation. Live-pushes to customer + admin.
  useEffect(() => {
    if (!b || phase !== "in_trip") return;


    // Draw the planned pickup→drop polyline once.
    (async () => {
      try {
        const r = await computeRoute({
          data: { origin: { lat: b.pickup_lat, lng: b.pickup_lng }, destination: { lat: b.drop_lat, lng: b.drop_lng } },
        });
        setPoly(r.polyline);
        setEtaMin(Math.max(1, Math.round(r.durationMin ?? 10)));
      } catch { /* ignore */ }
    })();

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      toast.error("GPS not available on this device");
      return;
    }
    const dropPt = { lat: b.drop_lat, lng: b.drop_lng };
    let reached = false;
    const watchId = navigator.geolocation.watchPosition(
      (g) => {
        const p = { lat: g.coords.latitude, lng: g.coords.longitude };
        setPos(p);
        const now = Date.now();
        if (now - dbTickRef.current > 4000) {
          dbTickRef.current = now;
          supabase.from("bookings").update({ driver_lat: p.lat, driver_lng: p.lng }).eq("id", b.id).then(() => {});
        }
        // ~120m proximity → reached drop
        const dKm = haversineKm(p, dropPt);
        if (!reached && dKm < 0.12) {
          reached = true;
          beep(500, 1040);
          setTimeout(() => beep(500, 1320), 250);
          notify("Reached drop ✅", "You have arrived at the drop location.");
          reachedDrop();
        }
      },
      (err) => toast.error(err.message || "Unable to read GPS"),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, b?.id]);

  function haversineKm(a: LatLng, c: LatLng) {
    const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(c.lat - a.lat), dLng = toRad(c.lng - a.lng);
    const h = Math.sin(dLat/2)**2 + Math.cos(toRad(a.lat))*Math.cos(toRad(c.lat))*Math.sin(dLng/2)**2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

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

  // Full-screen layout while driving
  if (showMap) {
    return (
      <div className="fixed inset-0 bg-background">
        {/* Full-screen map */}
        <div className="absolute inset-0">
          <RouteMap
            pickup={mapEndpoints.pickup}
            drop={mapEndpoints.drop}
            polyline={poly}
            driver={pos}
            height="100%"
          />
        </div>

        {/* Top header overlay */}
        <header className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 bg-card/95 backdrop-blur px-3 py-3 shadow-sm">
          <Link to="/driver" className="rounded-full p-2 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="flex-1">
            <div className="font-bold text-sm">Drive to {destLabel}</div>
            <div className="text-[11px] text-muted-foreground">OTP {b.otp}</div>
          </div>
          {etaMin !== null && (
            <div className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">
              <ClockIcon className="h-3 w-3" /> {etaMin} min
            </div>
          )}
        </header>

        {/* Bottom sheet */}
        <div className="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl bg-card shadow-2xl border-t border-border p-4 space-y-3 max-h-[55%] overflow-auto">
          <div className="mx-auto h-1 w-12 rounded-full bg-muted-foreground/30" />
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 text-emerald-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase text-muted-foreground">Pickup</div>
              <div className="font-semibold truncate">{b.pickup_address}</div>
            </div>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 text-rose-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase text-muted-foreground">Drop</div>
              <div className="font-semibold truncate">{b.drop_address}</div>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <span>{b.trip_type} · {Number(b.distance_km).toFixed(1)} km</span>
            <span className="font-bold">₹{b.fare}</span>
            <a href="tel:+919791298406" className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"><Phone className="h-3.5 w-3.5" /></a>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${phase === "in_trip" ? `${b.drop_lat},${b.drop_lng}` : `${b.pickup_lat},${b.pickup_lng}`}`}
              target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-1 rounded-xl border-2 border-primary py-3 text-sm font-bold text-primary"
            ><Navigation className="h-4 w-4" /> Navigate</a>
            <button
              onClick={phase === "in_trip" ? reachedDrop : arrivedAtPickup}
              className="rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
            >Reached {destLabel}</button>
          </div>
        </div>
      </div>
    );
  }

  // Non-map phases (otp / payment) — centered card layout
  return (
    <div className="min-h-screen bg-background pb-10">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-card px-3 py-3">
        <Link to="/driver" className="rounded-full p-2 hover:bg-muted"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1">
          <div className="font-bold">Active Trip</div>
          <div className="text-[11px] text-muted-foreground">OTP {b.otp}</div>
        </div>
      </header>

      <div className="p-4 space-y-3">
        <div className="rounded-2xl border border-border bg-card p-3 text-sm">
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-emerald-600" /><div><div className="text-[10px] uppercase text-muted-foreground">Pickup</div><div className="font-semibold">{b.pickup_address}</div></div></div>
          <div className="my-2 ml-2 h-4 w-px border-l-2 border-dashed border-muted-foreground/40" />
          <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-rose-600" /><div><div className="text-[10px] uppercase text-muted-foreground">Drop</div><div className="font-semibold">{b.drop_address}</div></div></div>
          <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <span>{b.trip_type} · {Number(b.distance_km).toFixed(1)} km</span>
            <span className="font-bold">₹{b.fare}</span>
          </div>
        </div>

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
      </div>

      {/* Payment modal popup */}
      {phase === "payment" && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card shadow-2xl border border-border p-5 animate-in slide-in-from-bottom-4 fade-in">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="mt-3 text-center text-base font-bold">Trip Complete</div>
            <div className="mt-1 text-center text-xs text-muted-foreground">Reached drop location. Collect payment to finish.</div>
            <div className="mt-4 text-center text-3xl font-bold text-primary">₹{b.fare}</div>

            <div className="mt-4 text-center text-xs font-semibold text-muted-foreground">Payment method</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {[
                { id: "cash" as const, I: Banknote, l: "Cash" },
                { id: "upi" as const, I: Wallet, l: "UPI" },
                { id: "card" as const, I: CreditCard, l: "Card" },
              ].map(({ id, I, l }) => (
                <button key={id} onClick={() => setPay(id)} className={cn("flex flex-col items-center gap-1 rounded-xl border-2 bg-card p-3 text-xs font-semibold",
                  pay === id ? "border-primary text-primary" : "border-border text-muted-foreground")}>
                  <I className="h-5 w-5" />{l}
                </button>
              ))}
            </div>
            <button onClick={collectAndComplete} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Complete trip</>}
            </button>
            {pay === "cash" && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">10% platform commission will be deducted from your wallet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
