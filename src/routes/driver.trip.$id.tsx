import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MapPin, Phone, KeyRound, CheckCircle2, Loader2, Navigation, Clock as ClockIcon, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { completeRide } from "@/lib/driver.functions";
import { computeRoute } from "@/lib/maps/routes.functions";
import { RouteMap } from "@/components/RouteMap";
// PaymentSheet no longer needed — payment method is decided up-front by the customer.
import { CancelReasonModal } from "@/components/CancelReasonModal";
import { cancelBookingServer } from "@/lib/driver.functions";
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
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const [pos, setPos] = useState<LatLng | null>(null);
  const [poly, setPoly] = useState<string | null>(null);
  const [etaMin, setEtaMin] = useState<number | null>(null);
  const dbTickRef = useRef<number>(0);
  const arrivedRef = useRef(false);

  useEffect(() => { ensureNotifyPermission(); }, []);

  useEffect(() => {
    supabase.from("bookings").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setB(data);
      if (data?.status === "in_progress") {
        const ps = (data?.payment_status ?? "").toLowerCase();
        if (ps === "awaiting" || ps === "cash_pending" || ps === "paid") setPhase("payment");
        else setPhase("in_trip");
      }
    });
    // Live booking updates — needed so payment_method / payment_status changes
    // pushed by the customer flow through to the driver UI in realtime.
    const ch = supabase
      .channel(`driver-booking:${id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${id}` },
        (p) => setB(p.new as any))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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
    const { error } = await supabase.rpc("verify_start_trip", { _booking_id: b.id, _otp: otp.trim() });
    if (error) { toast.error(error.message || "Wrong OTP"); return; }
    setPhase("in_trip");
    toast.success("Trip started");
  }

  async function reachedDrop() {
    if (!b) return;
    // Flip booking into "awaiting" — the customer app instantly opens the
    // payment chooser (Cash / UPI / Card). Driver waits for the choice.
    await supabase.from("bookings").update({
      driver_lat: b.drop_lat,
      driver_lng: b.drop_lng,
      payment_status: "awaiting",
      payment_method: "",
    } as any).eq("id", b.id);
    setPhase("payment");
  }


  async function collectAndComplete(method: "cash" | "upi" | "card") {
    if (!b || busy) return;
    setBusy(true);
    try {
      const r = await completeRide({ data: { booking_id: b.id, payment_method: method } });
      toast.success(`Trip complete. ₹${r.credit} credited.`);
      navigate({ to: "/driver" });
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  // Note: UPI now requires the driver to manually confirm receipt (no auto-complete).


  // Memoize map endpoints so RouteMap doesn't re-init every render (flicker fix)
  const mapPickup = useMemo(
    () => (b ? { lat: b.pickup_lat, lng: b.pickup_lng } : null),
    [b?.pickup_lat, b?.pickup_lng]
  );
  const mapDrop = useMemo(
    () => (b ? { lat: b.drop_lat, lng: b.drop_lng } : null),
    [b?.drop_lat, b?.drop_lng]
  );
  // Keep map endpoints STABLE — the driver marker animates on top.
  // Using `pos` as origin re-initializes the map on every GPS tick (flicker).
  const mapOrigin = mapPickup;
  const mapDest = useMemo(
    () => (phase === "in_trip" ? mapDrop : mapPickup),
    [phase, mapPickup, mapDrop]
  );

  if (!b || !mapPickup || !mapDrop) return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const showMap = phase === "to_pickup" || phase === "in_trip";
  const destLabel = phase === "in_trip" ? "drop" : "pickup";

  async function doCancel(reason: string) {
    if (!b) return;
    setCancelling(true);
    try {
      await cancelBookingServer({ data: { booking_id: b.id, reason, by: "driver" } });
      toast.success("Trip cancelled");
      navigate({ to: "/driver" });
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel");
    } finally {
      setCancelling(false);
      setShowCancel(false);
    }
  }

  // Full-screen layout while driving
  if (showMap) {
    return (
      <div className="fixed inset-0 bg-background">
        {/* Full-screen map */}
        <div className="absolute inset-0">
          <RouteMap
            pickup={mapOrigin!}
            drop={mapDest!}
            polyline={poly}
            driver={pos}
            driverPlate={b.vehicle_number ?? undefined}
            driverVehicleKind={b.vehicle_type === "suv" ? "suv" : "sedan"}
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
          <button
            onClick={() => setShowCancel(true)}
            className="rounded-full p-2 text-rose-600 hover:bg-rose-50"
            title="Cancel trip"
          ><XCircle className="h-5 w-5" /></button>
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

        {showCancel && (
          <CancelReasonModal
            title="Cancel this trip?"
            onCancel={() => setShowCancel(false)}
            onConfirm={doCancel}
          />
        )}
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

      {/* Payment phase — driver waits for / responds to customer choice */}
      {phase === "payment" && (() => {
        const pm = (b.payment_method ?? "").toLowerCase();
        const isCash = pm === "cash";
        const isUpi = pm === "upi";
        const upiUri = `upi://pay?pa=mabubbasha9791-1@oksbi&pn=Luxury%20Cabs&am=${Number(b.fare).toFixed(2)}&cu=INR&tn=Cab%20fare%20${b.id.slice(0, 8)}&tr=${b.id}`;
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
            <div className="w-full max-w-md rounded-t-3xl bg-card p-6 text-center shadow-2xl sm:rounded-3xl animate-in slide-in-from-bottom-4 fade-in max-h-[92vh] overflow-y-auto">
              {!pm && (
                <>
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                  </div>
                  <div className="mt-3 text-base font-bold">Waiting for customer</div>
                  <div className="mt-1 text-3xl font-extrabold text-primary">₹{Number(b.fare).toFixed(2)}</div>
                  <div className="text-[12px] text-muted-foreground">
                    Customer is choosing payment method (Cash / UPI).
                  </div>
                </>
              )}

              {isCash && (
                <>
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100">
                    <KeyRound className="h-7 w-7 text-amber-600" />
                  </div>
                  <div className="mt-3 text-base font-bold">Collect Cash</div>
                  <div className="mt-1 text-3xl font-extrabold text-primary">₹{Number(b.fare).toFixed(2)}</div>
                  <div className="text-[11px] text-muted-foreground">Customer selected Cash. Collect this amount.</div>
                  <button
                    disabled={busy}
                    onClick={() => collectAndComplete("cash")}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Payment Received</>}
                  </button>
                </>
              )}

              {isUpi && (
                <UpiQrPanel
                  fare={Number(b.fare)}
                  upiUri={upiUri}
                  busy={busy}
                  onConfirm={() => collectAndComplete("upi")}
                />
              )}
            </div>
          </div>
        );
      })()}
    </div>

  );
}

function UpiQrPanel({ fare, upiUri, busy, onConfirm }: { fare: number; upiUri: string; busy: boolean; onConfirm: () => void }) {
  const [nonce, setNonce] = useState(0);
  // Rebuild the QR whenever the fare or nonce changes so the amount encoded
  // in the UPI intent always matches the current total (extra hours/km).
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiUri)}&_=${nonce}-${Math.round(fare)}`;
  return (
    <>
      <div className="text-base font-bold">Show this QR to the customer</div>
      <div className="mt-1 text-3xl font-extrabold text-primary">₹{fare.toFixed(2)}</div>
      <div className="mx-auto mt-3 grid w-fit place-items-center rounded-2xl border border-border bg-white p-3">
        <img alt="UPI QR" src={qrSrc} width={220} height={220} />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        UPI ID: <span className="font-semibold text-foreground">mabubbasha9791-1@oksbi</span>
      </div>
      <button
        onClick={() => setNonce((n) => n + 1)}
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-primary"
      >
        ↻ Refresh QR (₹{fare.toFixed(2)})
      </button>
      <div className="mt-1 text-[11px] text-muted-foreground">
        After the customer pays and you see the credit notification, tap below to complete the trip.
      </div>
      <button
        disabled={busy}
        onClick={onConfirm}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Confirm Payment Received</>}
      </button>
    </>
  );
}
