import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Phone, MessageSquare, Shield, Star, Loader2, KeyRound,
  CheckCircle2, Copy, MapPin, Headphones, XCircle, Share2, UserRound,
  Sparkles, Crosshair, Car,
} from "lucide-react";
import { motion } from "framer-motion";
import { getBooking, updateBooking, bookingCode, type Booking } from "@/lib/booking-store";
import { RouteMap } from "@/components/RouteMap";
import { computeRoute } from "@/lib/maps/routes.functions";
import { supabase } from "@/integrations/supabase/client";
import { tariffFor, formatINR, type VehicleType } from "@/lib/fare";
import sedanImg from "@/assets/sedan.png";
import suvImg from "@/assets/suv.png";
import { cn } from "@/lib/utils";

type LatLng = { lat: number; lng: number };

export const Route = createFileRoute("/track/$id")({
  head: () => ({ meta: [{ title: "My Booking — Luxury Cabs" }] }),
  component: Track,
});

type Phase = "to_pickup" | "arrived" | "otp" | "in_trip" | "completing";

function Track() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [b, setB] = useState<Booking | null>(null);

  // Load + subscribe to realtime updates so admin assignment flips the UI.
  useEffect(() => {
    let mounted = true;
    getBooking(id).then((row) => { if (mounted) setB(row); });
    const ch = supabase
      .channel(`booking:${id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${id}` },
        (p) => setB(p.new as Booking))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [id]);

  if (!b) {
    return <div className="app-shell grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  // Branch: until admin assigns a driver, show "Booking Confirmed" status page.
  if (!b.driver_name) {
    return <AwaitingDriver b={b} onBack={() => navigate({ to: "/booking" })} />;
  }
  return <LiveTracking b={b} onBack={() => navigate({ to: "/booking" })} />;
}

// ---------- Awaiting driver assignment ----------

function AwaitingDriver({ b, onBack }: { b: Booking; onBack: () => void }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const code = bookingCode(b.id);
  const tariff = tariffFor(b.vehicle_type as VehicleType);
  const carImg = b.vehicle_type === "suv" ? suvImg : sedanImg;
  const scheduled = new Date(b.scheduled_at);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  async function cancelBooking() {
    if (!confirm("Cancel this booking?")) return;
    await updateBooking(b.id, { status: "cancelled" });
    navigate({ to: "/booking" });
  }

  function shareTrip() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/track/${b.id}` : "";
    const text = encodeURIComponent(
      `My Luxury Cabs booking ${code}\nFrom: ${b.pickup_address}\nTo: ${b.drop_address}\nTrack live: ${url}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  return (
    <div className="app-shell flex flex-col bg-background pb-10">
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <button onClick={onBack} className="rounded-full p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <div className="font-display text-lg font-bold leading-none">My Booking</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Booking ID: <span className="font-semibold text-foreground">{code}</span></span>
            <button onClick={copyCode} className="inline-flex items-center gap-1 text-primary">
              <Copy className="h-3 w-3" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <a href="tel:+918000000000" className="grid h-9 w-9 place-items-center rounded-full border border-border" aria-label="Support">
          <Headphones className="h-4 w-4" />
        </a>
      </div>

      {/* Confirmed banner */}
      <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft p-4">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-primary">Booking Confirmed</div>
          <div className="text-xs text-foreground/70">Driver details will be shared shortly.</div>
        </div>
      </div>

      {/* Trip details */}
      <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <MapPin className="h-4 w-4 text-primary" /> Trip Details
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground">Pickup</div>
                <div className="text-sm font-semibold">{b.pickup_address}</div>
              </div>
            </div>
            <div className="my-2 ml-1 h-4 w-px border-l-2 border-dashed border-muted-foreground/40" />
            <div className="flex items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-destructive" />
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground">Drop</div>
                <div className="text-sm font-semibold">{b.drop_address}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat label="Date" value={scheduled.toLocaleDateString()} />
            <Stat label="Time" value={scheduled.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
            <Stat label="Distance" value={`${Number(b.distance_km).toFixed(1)} km`} />
            <Stat label="ETA" value={`${b.duration_min} min`} />
          </div>
        </div>
      </div>

      {/* Ride details */}
      <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold">
          <Sparkles className="h-4 w-4 text-primary" /> Ride Details
        </div>
        <div className="flex items-center gap-3">
          <div className="grid h-16 w-24 shrink-0 place-items-center rounded-xl bg-background">
            <img src={carImg} alt={tariff.label} className="h-full w-full object-contain" />
          </div>
          <div className="flex-1">
            <div className="font-bold">{tariff.label}</div>
            <div className="text-xs text-muted-foreground">{tariff.seats} Seats · AC</div>
            <div className="text-[11px] text-muted-foreground">Best for {tariff.seats} People</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground">Fare (Est.)</div>
            <div className="text-lg font-bold">{formatINR(Number(b.fare))}</div>
            <div className="text-[11px] capitalize text-muted-foreground">{b.payment_method}</div>
          </div>
        </div>
      </div>

      {/* Driver not assigned panel */}
      <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700">
          <UserRound className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-amber-900">Driver Not Assigned Yet</div>
          <div className="text-xs text-amber-800/80">
            We're finding the nearest driver — this usually takes 10–20 minutes.
          </div>
        </div>
        <motion.span
          className="h-2.5 w-2.5 rounded-full bg-amber-500"
          animate={{ opacity: [1, 0.2, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
      </div>

      {/* Actions */}
      <div className="mx-4 mt-4 grid grid-cols-3 gap-2">
        <ActionBtn icon={<MapPin className="h-4 w-4 text-primary" />} label="Track" onClick={() => {}} disabled />
        <a
          href="tel:+918000000000"
          className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card py-3 text-xs font-semibold"
        >
          <Headphones className="h-4 w-4 text-foreground" />
          Support
        </a>
        <button
          onClick={cancelBooking}
          className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card py-3 text-xs font-semibold text-destructive"
        >
          <XCircle className="h-4 w-4" />
          Cancel
        </button>
      </div>

      {/* Share trip */}
      <button
        onClick={shareTrip}
        className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left"
      >
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-primary">
          <Shield className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Share Trip</div>
          <div className="text-xs text-muted-foreground">Send trip details to family/friends on WhatsApp.</div>
        </div>
        <Share2 className="h-4 w-4 text-primary" />
      </button>

    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function ActionBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-xl border border-border bg-card py-3 text-xs font-semibold disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
}

// ---------- Live tracking (driver assigned) ----------

function LiveTracking({ b, onBack }: { b: Booking; onBack: () => void }) {
  const navigate = useNavigate();
  const [driver, setDriver] = useState<LatLng | null>(
    b.driver_lat && b.driver_lng ? { lat: b.driver_lat, lng: b.driver_lng } : null
  );
  const [phase, setPhase] = useState<Phase>(
    b.status === "in_progress" ? "in_trip" :
    b.status === "driver_arrived" ? "arrived" :
    "to_pickup"
  );
  const [eta, setEta] = useState<number>(b.duration_min);
  const [tripPoly, setTripPoly] = useState<string | null>(null);
  const [toPickupPoly, setToPickupPoly] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [fitKey, setFitKey] = useState(0);
  const cancelRef = useRef<(() => void) | null>(null);

  // React to live booking updates (driver app pushes status & coords).
  useEffect(() => {
    if (b.driver_lat && b.driver_lng) setDriver({ lat: b.driver_lat, lng: b.driver_lng });
    if (b.status === "driver_arrived" && phase === "to_pickup") setPhase("arrived");
    if (b.status === "in_progress" && phase !== "in_trip") setPhase("in_trip");
    if (b.status === "completed") {
      navigate({ to: "/complete/$id", params: { id: b.id } });
    }
  }, [b.status, b.driver_lat, b.driver_lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute the to-pickup route polyline once.
  useEffect(() => {
    if (phase !== "to_pickup" || !b.driver_lat || !b.driver_lng) return;
    const cached = typeof window !== "undefined" ? sessionStorage.getItem(`toPickup:${b.id}`) : null;
    if (cached) { setToPickupPoly(cached); return; }
    computeRoute({
      data: { origin: { lat: b.driver_lat, lng: b.driver_lng }, destination: { lat: b.pickup_lat, lng: b.pickup_lng } },
    }).then((r) => {
      setToPickupPoly(r.polyline);
      try { sessionStorage.setItem(`toPickup:${b.id}`, r.polyline); } catch {}
    }).catch(() => {});
    void cancelRef.current; // keep ref referenced
  }, [phase, b.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute the trip polyline (pickup -> drop) when entering the trip.
  useEffect(() => {
    if (phase !== "in_trip") return;
    let poly = b.route_polyline;
    if (poly) { setTripPoly(poly); return; }
    computeRoute({
      data: { origin: { lat: b.pickup_lat, lng: b.pickup_lng }, destination: { lat: b.drop_lat, lng: b.drop_lng } },
    }).then((r) => setTripPoly(r.polyline)).catch(() => {});
  }, [phase, b.id]); // eslint-disable-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.id, phase]);

  function verifyOtp() {
    if (otp.trim() === b.otp) {
      setOtpError("");
      updateBooking(b.id, { status: "in_progress" }).catch(() => {});
      setPhase("in_trip");
    } else {
      setOtpError("Invalid OTP. Please ask the driver again.");
    }
  }

  const mapPickup = { lat: b.pickup_lat, lng: b.pickup_lng };
  const mapDrop = { lat: b.drop_lat, lng: b.drop_lng };

  return (
    <div className="app-shell flex flex-col bg-background">
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <button onClick={onBack} className="rounded-full p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <div className="font-display text-lg font-bold leading-none">
            {phase === "to_pickup" && "Driver on the way"}
            {phase === "arrived" && "Driver arrived"}
            {phase === "otp" && "Verify OTP"}
            {phase === "in_trip" && "Trip in progress"}
            {phase === "completing" && "Completing trip…"}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Live Tracking · ETA {eta} min
          </div>
        </div>
      </div>

      <div className="relative px-3 pt-3">
        <RouteMap
          pickup={mapPickup}
          drop={mapDrop}
          polyline={phase === "in_trip" || phase === "completing" ? (tripPoly ?? b.route_polyline) : (toPickupPoly ?? b.route_polyline)}
          driver={driver}
          height={340}
          fitKey={fitKey}
        />
        {/* Live pill */}
        <div className="pointer-events-none absolute left-5 top-5 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow-lg">
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-white"
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          LIVE · ETA {eta} min
        </div>
        {/* Stat chips */}
        <div className="absolute right-5 top-5 flex flex-col gap-2">
          <Chip label="Time" value={`${eta}m`} />
          <Chip label="Distance" value={`${Number(b.distance_km).toFixed(1)}km`} />
          <Chip label="Fare" value={formatINR(Number(b.fare))} />
          <Chip label="Toll" value="₹0" />
        </div>
        {/* Recenter */}
        <button
          onClick={() => setFitKey((k) => k + 1)}
          aria-label="Recenter"
          className="absolute bottom-5 right-5 grid h-10 w-10 place-items-center rounded-full bg-background shadow-lg ring-1 ring-border"
        >
          <Crosshair className="h-5 w-5 text-primary" />
        </button>
      </div>

      {/* Bottom 'ride on the way' bar */}
      <div className="mx-3 mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
          <Car className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold">Your Ride is on the way</div>
          <div className="text-[11px] text-muted-foreground">Driver is following the best route</div>
        </div>
      </div>

      {/* Driver card */}
      <div className="mx-3 mt-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <img
            src={b.driver_photo ?? "https://i.pravatar.cc/200"}
            alt={b.driver_name ?? "Driver"}
            className="h-14 w-14 rounded-full object-cover ring-2 ring-primary/30"
          />
          <div className="flex-1">
            <div className="font-bold">{b.driver_name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
              {b.driver_rating} · {b.driver_trips} trips
            </div>
            <div className="mt-0.5 text-xs font-semibold text-foreground">
              {b.vehicle_model} · <span className="text-primary">{b.vehicle_number}</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <a href={`tel:${b.driver_phone}`} className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground">
              <Phone className="h-4 w-4" />
            </a>
            <button className="grid h-10 w-10 place-items-center rounded-full border border-border text-foreground">
              <MessageSquare className="h-4 w-4" />
            </button>
          </div>
        </div>

        {phase === "to_pickup" && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary-soft p-2.5 text-xs text-foreground/80">
            <Shield className="h-4 w-4 text-primary" /> Share your OTP only at pickup — never before.
          </div>
        )}

        {phase === "arrived" && (
          <button
            onClick={() => setPhase("otp")}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"
          >
            <KeyRound className="h-4 w-4" /> Start Trip (Enter OTP)
          </button>
        )}
      </div>

      {phase === "otp" && (
        <motion.div
          initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] rounded-t-3xl border-t border-border bg-card p-5 shadow-2xl"
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
          <h3 className="text-center font-display text-xl font-bold">Share OTP with Driver</h3>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            Your trip OTP is <span className="font-bold text-primary">{b.otp}</span>. Driver will enter it from their app.
          </p>
          <input
            inputMode="numeric"
            maxLength={4}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="mt-4 w-full rounded-xl border-2 border-border bg-background px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-primary"
            placeholder="••••"
          />
          {otpError && <div className="mt-2 text-center text-xs text-destructive">{otpError}</div>}
          <button
            onClick={verifyOtp}
            disabled={otp.length !== 4}
            className={cn(
              "mt-4 w-full rounded-xl py-3 text-sm font-bold transition",
              otp.length === 4 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            Verify & Start Trip
          </button>
        </motion.div>
      )}

      <div className="h-6" />
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/95 px-2.5 py-1.5 text-right shadow ring-1 ring-border backdrop-blur">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-bold text-foreground">{value}</div>
    </div>
  );
}
