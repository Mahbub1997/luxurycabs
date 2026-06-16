import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Phone, MessageSquare, Shield, Star, Loader2,
  CheckCircle2, Copy, MapPin, Headphones, XCircle, Share2, UserRound,
  Sparkles, Crosshair, Car, Clock as ClockIcon, ShieldCheck, X,
} from "lucide-react";
import { motion } from "framer-motion";
import { getBooking, updateBooking, bookingCode, type Booking } from "@/lib/booking-store";
import { RouteMap } from "@/components/RouteMap";
import { CrownCarLogo } from "@/components/Brand";
import { computeRoute } from "@/lib/maps/routes.functions";
import { supabase } from "@/integrations/supabase/client";
import { tariffFor, formatINR, type VehicleType } from "@/lib/fare";
import { formatDuration, formatTime12 } from "@/lib/utils";
import { notify, ensureNotifyPermission } from "@/lib/notify";
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
  const prevRef = useRef<{ driverId: string | null; status: string | null }>({ driverId: null, status: null });

  // Ask for notification permission once.
  useEffect(() => { ensureNotifyPermission(); }, []);

  // Load + subscribe to realtime updates so admin assignment flips the UI.
  useEffect(() => {
    let mounted = true;
    getBooking(id).then((row) => {
      if (!mounted) return;
      setB(row);
      if (row) prevRef.current = { driverId: row.assigned_driver_id ?? null, status: row.status };
    });
    const ch = supabase
      .channel(`booking:${id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings", filter: `id=eq.${id}` },
        (p) => {
          const next = p.new as Booking;
          const prev = prevRef.current;
          // Driver newly assigned
          if (!prev.driverId && next.assigned_driver_id) {
            notify("Driver assigned 🚗", `${next.driver_name ?? "Your driver"} is on the way.`, next.driver_photo ?? undefined);
          }
          // Driver arrived
          if (prev.status !== "driver_arrived" && next.status === "driver_arrived") {
            notify("Driver arrived 📍", "Your driver is at the pickup point. Share your OTP to start.");
          }
          // Trip complete
          if (prev.status !== "completed" && next.status === "completed") {
            notify("Trip completed ✅", `Fare ₹${next.fare}. Thanks for riding with Luxury Cabs!`);
          }
          prevRef.current = { driverId: next.assigned_driver_id ?? null, status: next.status };
          setB(next);
        })
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
    <div className="app-shell flex flex-col bg-muted/30 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-primary-soft/60 px-4 py-4 backdrop-blur">
        <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full hover:bg-background/60" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold">Booking Confirmed</h1>
        <a
          href="tel:+919791298406"
          className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-background px-3 py-1.5 text-xs font-semibold text-primary"
        >
          <Headphones className="h-4 w-4" /> Support
        </a>
      </div>

      {/* Success card */}
      <div className="mx-4 mt-4 rounded-2xl border border-border bg-card px-4 pb-5 pt-6 text-center">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 18 }}
          className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary-soft"
        >
          <span className="absolute inset-2 rounded-full bg-primary/20" />
          <span className="relative grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <CheckCircle2 className="h-7 w-7" />
          </span>
        </motion.div>
        <div className="mt-4 text-xl font-extrabold text-primary">Your booking is confirmed!</div>
        <div className="mt-1 text-sm text-foreground/70">
          We are finding you the best driver.<br />Please wait while we match you.
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
            <ClockIcon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold">Searching for driver…</div>
            <div className="text-[11px] text-muted-foreground">This usually takes less than a minute.</div>
          </div>
          <div className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-2 w-2 rounded-full bg-primary"
                animate={{ opacity: [0.25, 1, 0.25] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Trip details */}
      <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-base font-bold">Trip Details</div>
        </div>
        <div className="flex">
          <div className="mr-3 flex flex-col items-center pt-1">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-primary" />
            <span className="my-1 h-10 w-px border-l-2 border-dashed border-muted-foreground/40" />
            <MapPin className="h-4 w-4 text-rose-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{b.pickup_address}</div>
            <div className="mt-6 flex items-start justify-between gap-2">
              <div className="min-w-0 text-sm font-medium">{b.drop_address}</div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                <div className="font-bold text-foreground">{Number(b.distance_km).toFixed(1)} km</div>
                <div>{formatDuration(b.duration_min)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle + fare row */}
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
          <img src={carImg} alt={tariff.label} className="h-14 w-20 object-contain scale-x-[-1]" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">Selected Vehicle</div>
            <div className="text-base font-bold">{tariff.label}</div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-muted-foreground">Total Fare</div>
            <div className="text-lg font-extrabold text-primary">{formatINR(Number(b.fare))}</div>
            <div className="text-[10px] text-muted-foreground">Inclusive of all taxes</div>
          </div>
        </div>
      </div>

      {/* Trust strip */}
      <div className="mx-4 mt-3 grid grid-cols-4 gap-1 rounded-2xl bg-primary-soft px-2 py-3 text-center text-[10px] font-semibold text-primary">
        <div className="flex flex-col items-center gap-1"><ShieldCheck className="h-4 w-4" />No surge<br/>pricing</div>
        <div className="flex flex-col items-center gap-1"><ShieldCheck className="h-4 w-4" />Free<br/>cancellation</div>
        <div className="flex flex-col items-center gap-1"><ShieldCheck className="h-4 w-4" />Secure<br/>rides</div>
        <div className="flex flex-col items-center gap-1"><Headphones className="h-4 w-4" />24x7<br/>support</div>
      </div>

      {/* Notify panel */}
      <div className="mx-4 mt-3 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-amber-900">We'll notify you once a driver is assigned.</div>
          <div className="text-xs text-amber-800/80">You can track the driver and vehicle details here.</div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="mx-4 mt-4 grid grid-cols-2 gap-3">
        <a
          href="tel:+919791298406"
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-primary py-3.5 text-sm font-bold text-primary"
        >
          <Phone className="h-4 w-4" /> Contact Support
        </a>
        <button
          onClick={shareTrip}
          className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground"
        >
          <Share2 className="h-4 w-4" /> Share Trip
        </button>
      </div>

      <button
        onClick={cancelBooking}
        className="mx-4 mt-3 flex items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-background py-3 text-sm font-semibold text-destructive"
      >
        <XCircle className="h-4 w-4" /> Cancel Booking
      </button>

      <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2 text-xs">
        <span className="text-muted-foreground">Booking ID</span>
        <span className="font-semibold">{code}</span>
        <button onClick={copyCode} className="inline-flex items-center gap-1 text-primary">
          <Copy className="h-3 w-3" />{copied ? "Copied" : "Copy"}
        </button>
      </div>
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
  const [fitKey, setFitKey] = useState(0);
  const [secsLeft, setSecsLeft] = useState(300);
  const cancelRef = useRef<(() => void) | null>(null);

  // Follow the assigned driver's real GPS from the driver profile as soon as it changes.
  useEffect(() => {
    if (!b.assigned_driver_id) return;
    let mounted = true;
    const applyDriverLocation = (row: any) => {
      if (!mounted || !row?.current_lat || !row?.current_lng) return;
      setDriver({ lat: Number(row.current_lat), lng: Number(row.current_lng) });
      setFitKey((k) => k + 1);
    };
    supabase
      .from("drivers")
      .select("current_lat, current_lng")
      .eq("id", b.assigned_driver_id)
      .maybeSingle()
      .then(({ data }) => applyDriverLocation(data));
    const ch = supabase
      .channel(`driver-location:${b.assigned_driver_id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${b.assigned_driver_id}` },
        (p) => applyDriverLocation(p.new)
      )
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [b.assigned_driver_id]);

  // OTP countdown (5 minutes) — starts only after driver has arrived.
  useEffect(() => {
    if (phase !== "arrived" && phase !== "otp") return;
    setSecsLeft(300);
    const id = setInterval(() => setSecsLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [phase]);
  const mmss = `${String(Math.floor(secsLeft / 60)).padStart(2, "0")}:${String(secsLeft % 60).padStart(2, "0")}`;


  // React to live booking updates (driver app pushes status & coords).
  useEffect(() => {
    if (b.driver_lat && b.driver_lng) {
      setDriver({ lat: b.driver_lat, lng: b.driver_lng });
      setFitKey((k) => k + 1);
    }
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


  const mapPickup = { lat: b.pickup_lat, lng: b.pickup_lng };
  const mapDrop = { lat: b.drop_lat, lng: b.drop_lng };

  const otpDigits = (b.otp ?? "").padEnd(4, " ").slice(0, 4).split("");
  const code = bookingCode(b.id);

  async function cancelRide() {
    if (!confirm("Cancel this ride?")) return;
    await updateBooking(b.id, { status: "cancelled" }).catch(() => {});
    navigate({ to: "/booking" });
  }
  function shareTrip() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/track/${b.id}` : "";
    const text = encodeURIComponent(
      `My Luxury Cabs booking ${code}\nFrom: ${b.pickup_address}\nTo: ${b.drop_address}\nTrack live: ${url}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  const headerTitle =
    phase === "in_trip" ? "Trip in progress" :
    phase === "completing" ? "Completing trip…" :
    phase === "arrived" ? "Driver has arrived" :
    "Your driver is on the way";
  const headerSub =
    phase === "in_trip" ? "Heading to drop location" :
    phase === "arrived" ? "Share OTP to start the trip" :
    "Driver assigned & trip start OTP";

  return (
    <div className="app-shell flex flex-col bg-background pb-6">
      {/* Top brand header */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <button onClick={onBack} className="rounded-full p-2 hover:bg-muted" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1.5 font-display text-lg font-bold text-primary">
          <CrownCarLogo className="h-5 w-5" />
          Luxury Cabs
        </div>
        <span className="h-9 w-9" />
      </div>

      {/* Title + ETA pill */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div>
          <h1 className="font-display text-xl font-bold leading-tight">{headerTitle}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{headerSub}</p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-xs">
          <ClockIcon className="h-3.5 w-3.5 text-primary" />
          <span className="text-muted-foreground">ETA:</span>
          <span className="font-bold text-primary">{formatDuration(eta)}</span>
        </div>
      </div>

      {/* Map with overlay pickup/drop card */}
      <div className="relative mx-4 mt-3">
        <RouteMap
          pickup={mapPickup}
          drop={mapDrop}
          polyline={phase === "in_trip" || phase === "completing" ? (tripPoly ?? b.route_polyline) : (toPickupPoly ?? b.route_polyline)}
          driver={driver}
          height={300}
          fitKey={fitKey}
        />

        {/* Pickup / Drop overlay */}
        <div className="absolute left-3 top-3 w-[68%] max-w-[280px] rounded-xl bg-card/95 p-3 shadow-lg ring-1 ring-border backdrop-blur">
          <div className="flex items-start gap-2">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">Pickup Location</div>
              <div className="truncate text-xs font-semibold">{b.pickup_address}</div>
            </div>
          </div>
          <div className="my-1.5 ml-1 h-3 w-px border-l-2 border-dashed border-muted-foreground/40" />
          <div className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-destructive">Drop Location</div>
              <div className="truncate text-xs font-semibold">{b.drop_address}</div>
            </div>
          </div>
        </div>

        {/* Left side action stack */}
        <div className="absolute left-3 bottom-3 flex flex-col gap-2">
          <button
            onClick={() => setFitKey((k) => k + 1)}
            aria-label="Recenter"
            className="grid h-9 w-9 place-items-center rounded-lg bg-card shadow ring-1 ring-border"
          >
            <Crosshair className="h-4 w-4 text-primary" />
          </button>
          <button aria-label="Safety" className="grid h-9 w-9 place-items-center rounded-lg bg-card shadow ring-1 ring-border">
            <ShieldCheck className="h-4 w-4 text-primary" />
          </button>
        </div>
      </div>

      {/* Driver card */}
      <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <DriverPhoto src={b.driver_photo} name={b.driver_name} />
          <div className="flex-1 min-w-0">
            <div className="font-bold leading-tight">{b.driver_name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
              <span className="font-semibold text-foreground">{b.driver_rating ?? "—"}</span>
              <span>({b.driver_trips ?? 0} trips)</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{b.vehicle_number ?? "—"}</span>
              <span> · {b.vehicle_model ?? "—"}</span>
            </div>
          </div>
          <img
            src={b.vehicle_type === "suv" ? suvImg : sedanImg}
            alt="Car"
            className="hidden h-12 w-16 object-contain sm:block"
          />
          <div className="rounded-xl border border-primary/30 bg-primary-soft px-2.5 py-1.5 text-center">
            <div className="text-sm font-bold text-primary leading-none">{formatDuration(eta)}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">away</div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={`tel:${b.driver_phone}`} className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold text-primary">
            <Phone className="h-4 w-4" /> Call Driver
          </a>
          <button className="flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold">
            <MessageSquare className="h-4 w-4" /> Chat
          </button>
        </div>
      </div>

      {/* Driver mins away strip */}
      <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
          <Car className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold">Driver is {formatDuration(eta)} away</div>
          <div className="text-[11px] text-muted-foreground">
            {Number(b.distance_km).toFixed(1)} km from your location
          </div>
        </div>
        <button className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
          Live Tracking <span aria-hidden>›</span>
        </button>
      </div>

      {/* Trip Start Verification (OTP display) */}
      {phase !== "in_trip" && phase !== "completing" && (
        <div className="mx-4 mt-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold">Trip Start Verification</div>
              <div className="text-[11px] text-muted-foreground">
                Please share this OTP with your driver to start the trip
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-center gap-2">
            {otpDigits.map((d, i) => (
              <div key={i} className="grid h-14 w-14 place-items-center rounded-xl border-2 border-border bg-background text-2xl font-bold text-primary">
                {d.trim() || "•"}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px]">
            {phase === "arrived" || phase === "otp" ? (
              <>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <ClockIcon className="h-3 w-3" /> OTP expires in <span className="font-semibold text-foreground">{mmss}</span>
                </span>
                <button onClick={() => setSecsLeft(300)} className="font-semibold text-primary">
                  Didn't get OTP? ↻
                </button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <ClockIcon className="h-3 w-3" /> 5-min OTP timer starts once your driver arrives.
              </span>
            )}
          </div>

          <div className="mt-3 text-center text-[11px] text-muted-foreground">
            Share this OTP with your driver. The driver will enter it to start your trip.
          </div>
        </div>
      )}

      {/* Share / Cancel */}
      <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={shareTrip}
          className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 py-3 text-sm font-semibold text-primary"
        >
          <Share2 className="h-4 w-4" /> Share Trip
        </button>
        <button
          onClick={cancelRide}
          className="flex items-center justify-center gap-2 rounded-xl border border-destructive/40 py-3 text-sm font-semibold text-destructive"
        >
          <XCircle className="h-4 w-4" /> Cancel Ride
        </button>
      </div>

    </div>
  );
}

function DriverPhoto({ src, name }: { src?: string | null; name?: string | null }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  useEffect(() => { setLoaded(false); setErrored(false); }, [src]);
  const initial = (name ?? "D").trim().charAt(0).toUpperCase();
  const showImg = !!src && !errored;
  return (
    <div className="relative h-14 w-14 shrink-0">
      {showImg && (
        <img
          src={src!}
          alt={name ?? "Driver"}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={cn(
            "h-14 w-14 rounded-full object-cover ring-2 ring-primary/30 transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0"
          )}
        />
      )}
      {(!showImg || !loaded) && (
        <div className={cn(
          "absolute inset-0 grid place-items-center rounded-full ring-2 ring-primary/30 font-bold text-lg",
          showImg ? "animate-pulse bg-muted text-transparent" : "bg-primary-soft text-primary"
        )}>
          {initial}
        </div>
      )}
    </div>
  );
}


