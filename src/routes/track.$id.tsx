import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Phone, MessageSquare, Star, Loader2,
  CheckCircle2, Copy, MapPin, Headphones, XCircle, Share2, UserRound,
  Crosshair, Clock as ClockIcon, ShieldCheck, X,
  Banknote, Wallet,
} from "lucide-react";
import { motion } from "framer-motion";
import { clearMinimizedActiveBooking, getBooking, updateBooking, bookingCode, minimizeActiveBooking, type Booking } from "@/lib/booking-store";
import { RouteMap } from "@/components/RouteMap";
import { PlateBadge } from "@/components/VehicleIcon";
import { computeRoute } from "@/lib/maps/routes.functions";
import { cancelBookingServer } from "@/lib/driver.functions";
import { CancelReasonModal } from "@/components/CancelReasonModal";
import { supabase } from "@/integrations/supabase/client";
import { tariffFor, formatINR, type VehicleType } from "@/lib/fare";
import { formatDuration, formatTime12 } from "@/lib/utils";
import { notify, ensureNotifyPermission, beep } from "@/lib/notify";
import sedanImg from "@/assets/sedan.png";
import suvImg from "@/assets/suv.png";
import { cn } from "@/lib/utils";
import { toast } from "sonner";



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
  const exitToHome = () => {
    if (b && b.status !== "cancelled" && b.status !== "completed") {
      minimizeActiveBooking(b.id);
      window.dispatchEvent(new CustomEvent("luxury-booking-minimized"));
    }
    navigate({ to: "/booking" });
  };

  // Ask for notification permission once.
  useEffect(() => { ensureNotifyPermission(); }, []);
  useEffect(() => { clearMinimizedActiveBooking(id); }, [id]);

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
          // Driver newly assigned — heavy sound + vibration
          if (!prev.driverId && next.assigned_driver_id) {
            notify("Driver assigned 🚗", `${next.driver_name ?? "Your driver"} is on the way.`, next.driver_photo ?? undefined);
            try { beep(700, 660); setTimeout(() => beep(700, 880), 300); setTimeout(() => beep(700, 990), 600); } catch {}
            try { if ("vibrate" in navigator) (navigator as any).vibrate([400, 120, 400, 120, 600]); } catch {}
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

  if (b.status === "cancelled") {
    return <CancelledBooking b={b} onHome={() => navigate({ to: "/booking", replace: true })} />;
  }

  // Show driver details ONLY after the driver has accepted (status moves to
  // driver_assigned). 'driver_offered' means admin assigned but driver hasn't
  // accepted yet — keep the customer on the "searching" screen.
  const driverAccepted = ["driver_assigned", "driver_arrived", "in_progress", "completed"].includes(b.status);
  if (!driverAccepted) {
    return <AwaitingDriver b={b} onBack={exitToHome} onCancelled={setB} />;
  }
  return <LiveTracking b={b} onBack={exitToHome} onCancelled={setB} />;
}


// ---------- Awaiting driver assignment ----------

function AwaitingDriver({ b, onBack, onCancelled }: { b: Booking; onBack: () => void; onCancelled: (b: Booking) => void }) {
  const [copied, setCopied] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
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

  async function doCancel(reason: string) {
    try {
      await cancelBookingServer({ data: { booking_id: b.id, reason, by: "user" } });
      const next = await getBooking(b.id);
      clearMinimizedActiveBooking(b.id);
      notify("Booking cancelled", "Your booking has been cancelled.");
      if (next) onCancelled(next);
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel");
    } finally {
      setShowCancel(false);
    }
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

      {/* Bottom actions — Share Trip is intentionally hidden until a driver is assigned */}
      <div className="mx-4 mt-4">
        <a
          href="tel:+919791298406"
          className="flex items-center justify-center gap-2 rounded-xl border-2 border-primary py-3.5 text-sm font-bold text-primary"
        >
          <Phone className="h-4 w-4" /> Contact Support
        </a>
      </div>


      <button
        onClick={() => setShowCancel(true)}
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

      {showCancel && (
        <CancelReasonModal
          title="Cancel booking?"
          onCancel={() => setShowCancel(false)}
          onConfirm={doCancel}
        />
      )}
    </div>
  );
}


function CancelledBooking({ b, onHome }: { b: Booking; onHome: () => void }) {
  const code = bookingCode(b.id);
  return (
    <div className="app-shell flex flex-col bg-muted/30 pb-10">
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-4 backdrop-blur">
        <button onClick={onHome} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Home">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-center text-lg font-bold">Booking Cancelled</h1>
        <span className="h-9 w-9" />
      </div>
      <div className="mx-4 mt-6 rounded-2xl border border-destructive/30 bg-card p-5 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-destructive/10 text-destructive">
          <XCircle className="h-10 w-10" />
        </div>
        <h2 className="mt-4 text-xl font-extrabold text-destructive">Booking cancelled</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your booking {code} has been cancelled.</p>
        {(b as any).cancellation_reason && (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-left text-xs">
            <div className="font-semibold text-destructive">
              Cancelled {(b as any).cancelled_by ? `by ${(b as any).cancelled_by}` : ""}
            </div>
            <div className="mt-1 text-foreground/80">{(b as any).cancellation_reason}</div>
          </div>
        )}
      </div>
      <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-3 w-3 rounded-full border-2 border-primary" />
          <div className="min-w-0 flex-1 text-sm font-medium">{b.pickup_address}</div>
        </div>
        <div className="ml-1.5 my-2 h-6 w-px border-l-2 border-dashed border-muted-foreground/40" />
        <div className="flex items-start gap-3">
          <MapPin className="h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1 text-sm font-medium">{b.drop_address}</div>
        </div>
      </div>
      <button onClick={onHome} className="mx-4 mt-4 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground">
        Back to Home
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

/** Public share viewers (link opened with `?share=1`) only get live map +
 *  addresses + call + chat. No OTP, fare, cancel, payment overlay, share button. */
function isShareView(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("share") === "1";
}

function LiveTracking({ b, onBack, onCancelled }: { b: Booking; onBack: () => void; onCancelled: (b: Booking) => void }) {
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
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const shareView = isShareView();

  // Memoize map endpoints so RouteMap doesn't re-init on every parent render (flicker fix)
  const mapPickup = useMemo(() => ({ lat: b.pickup_lat, lng: b.pickup_lng }), [b.pickup_lat, b.pickup_lng]);
  const mapDrop = useMemo(() => ({ lat: b.drop_lat, lng: b.drop_lng }), [b.drop_lat, b.drop_lng]);

  // Follow assigned driver's real GPS
  useEffect(() => {
    if (!b.assigned_driver_id) return;
    let mounted = true;
    const apply = (row: any) => {
      if (!mounted || !row?.current_lat || !row?.current_lng) return;
      setDriver({ lat: Number(row.current_lat), lng: Number(row.current_lng) });
    };
    supabase.from("drivers").select("current_lat, current_lng")
      .eq("id", b.assigned_driver_id).maybeSingle().then(({ data }) => apply(data));
    const ch = supabase.channel(`driver-loc:${b.assigned_driver_id}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${b.assigned_driver_id}` },
        (p) => apply(p.new))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [b.assigned_driver_id]);

  // OTP countdown — persisted across page refreshes via localStorage.
  // Starts once the driver arrives; after 5 min elapsed we show waiting-charge
  // notice instead of resetting a new 5-minute window.
  const otpStartedRef = useRef(false);
  useEffect(() => {
    if (phase !== "arrived" && phase !== "otp") return;
    const key = `otpStart:${b.id}`;
    let startMs: number | null = null;
    try { const v = typeof window !== "undefined" ? localStorage.getItem(key) : null; if (v) startMs = Number(v); } catch {}
    if (!startMs || Number.isNaN(startMs)) {
      startMs = Date.now();
      try { localStorage.setItem(key, String(startMs)); } catch {}
    }
    otpStartedRef.current = true;
    const tick = () => setSecsLeft(Math.max(0, 300 - Math.floor((Date.now() - startMs!) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, b.id]);
  const mmss = `${String(Math.floor(secsLeft / 60)).padStart(2, "0")}:${String(secsLeft % 60).padStart(2, "0")}`;
  const waitingChargesActive = otpStartedRef.current && secsLeft === 0 && (phase === "arrived" || phase === "otp");

  // Auto-expand the bottom sheet the moment the driver arrives so the OTP is
  // immediately visible. Auto-collapse once the trip starts (OTP entered).
  useEffect(() => {
    if (phase === "arrived" || phase === "otp") setSheetExpanded(true);
    if (phase === "in_trip" || phase === "completing") setSheetExpanded(false);
  }, [phase]);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  async function resendOtp() {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    try {
      const newOtp = String(Math.floor(1000 + Math.random() * 9000));
      await updateBooking(b.id, { otp: newOtp } as any);
      setSecsLeft(300);
      setResendCooldown(30);
      toast.success("New OTP generated");
    } catch (e: any) {
      toast.error(e.message || "Failed to resend OTP");
    } finally {
      setResending(false);
    }
  }

  // React to live booking updates
  useEffect(() => {
    if (b.driver_lat && b.driver_lng) setDriver({ lat: b.driver_lat, lng: b.driver_lng });
    if (b.status === "driver_arrived" && phase === "to_pickup") setPhase("arrived");
    if (b.status === "in_progress" && phase !== "in_trip") setPhase("in_trip");
    if (b.status === "completed") navigate({ to: "/complete/$id", params: { id: b.id } });
  }, [b.status, b.driver_lat, b.driver_lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // To-pickup polyline (cached)
  useEffect(() => {
    if (phase !== "to_pickup" || !b.driver_lat || !b.driver_lng) return;
    const cached = typeof window !== "undefined" ? sessionStorage.getItem(`toPickup:${b.id}`) : null;
    if (cached) { setToPickupPoly(cached); return; }
    computeRoute({ data: { origin: { lat: b.driver_lat, lng: b.driver_lng }, destination: mapPickup } })
      .then((r) => {
        setToPickupPoly(r.polyline);
        try { sessionStorage.setItem(`toPickup:${b.id}`, r.polyline); } catch {}
      }).catch(() => {});
  }, [phase, b.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trip polyline pickup → drop
  useEffect(() => {
    if (phase !== "in_trip") return;
    if (b.route_polyline) { setTripPoly(b.route_polyline); return; }
    computeRoute({ data: { origin: mapPickup, destination: mapDrop } })
      .then((r) => setTripPoly(r.polyline)).catch(() => {});
  }, [phase, b.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live ETA refresh — every 60s recompute based on driver position
  useEffect(() => {
    if (phase === "completing") return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const origin = phase === "in_trip" ? (driver ?? mapPickup) : (driver ?? null);
        const destination = phase === "in_trip" ? mapDrop : mapPickup;
        if (!origin) return;
        const r = await computeRoute({ data: { origin, destination } });
        if (!cancelled && r?.durationMin) setEta(Math.max(1, Math.round(r.durationMin)));
      } catch { /* ignore */ }
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [phase, driver?.lat, driver?.lng, mapPickup, mapDrop]);

  const otpDigits = (b.otp ?? "").padEnd(4, " ").slice(0, 4).split("");
  const code = bookingCode(b.id);

  async function doCancel(reason: string) {
    try {
      await cancelBookingServer({ data: { booking_id: b.id, reason, by: "user" } });
      const next = await getBooking(b.id);
      clearMinimizedActiveBooking(b.id);
      notify("Booking cancelled", "Your ride has been cancelled.");
      if (next) onCancelled(next);
    } catch (e: any) {
      toast.error(e.message || "Failed to cancel");
    } finally {
      setShowCancel(false);
    }
  }

  function shareTrip() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/track/${b.id}?share=1` : "";
    const text = encodeURIComponent(
      `Track my Luxury Cabs ride ${code} live: ${url}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  const headerTitle =
    phase === "in_trip" ? "Trip in progress" :
    phase === "completing" ? "Completing trip…" :
    phase === "arrived" ? "Driver has arrived" :
    "Driver on the way";

  const polylineForMap = phase === "in_trip" || phase === "completing"
    ? (tripPoly ?? b.route_polyline)
    : (toPickupPoly ?? b.route_polyline);

  return (
    <div className="fixed inset-0 bg-background">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <RouteMap
          pickup={mapPickup}
          drop={mapDrop}
          polyline={polylineForMap}
          driver={driver}
          driverPlate={b.vehicle_number ?? undefined}
          driverVehicleKind={b.vehicle_type === "suv" ? "suv" : "sedan"}
          height="100%"
          fitKey={fitKey}
        />
      </div>

      {/* Top header overlay */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 bg-card/95 backdrop-blur px-3 py-3 shadow-sm">
        <button onClick={onBack} className="rounded-full p-2 hover:bg-muted" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{headerTitle}</div>
          <div className="text-[11px] text-muted-foreground truncate">Booking {code}</div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">
          <ClockIcon className="h-3 w-3" /> {formatDuration(eta)}
        </div>
      </header>

      {/* Floating map controls */}
      <div className="absolute right-3 top-20 z-20 flex flex-col gap-2">
        <button
          onClick={() => setFitKey((k) => k + 1)}
          aria-label="Recenter"
          className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-lg ring-1 ring-border"
        >
          <Crosshair className="h-4 w-4 text-primary" />
        </button>
        <a
          href="tel:+919791298406"
          aria-label="Safety / Support"
          className="grid h-10 w-10 place-items-center rounded-full bg-card shadow-lg ring-1 ring-border"
        >
          <ShieldCheck className="h-4 w-4 text-primary" />
        </a>
      </div>

      {/* Bottom sheet (Uber-style) — collapsed = driver + share; pull up for OTP & details */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl bg-card shadow-2xl border-t border-border overflow-hidden transition-[max-height] duration-300",
          sheetExpanded ? "max-h-[85vh]" : "max-h-[32vh]"
        )}
      >
        <button
          onClick={() => setSheetExpanded((v) => !v)}
          className="w-full pt-2 pb-1"
          aria-label={sheetExpanded ? "Collapse details" : "Expand details"}
        >
          <span className="mx-auto block h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        </button>

        <div className="px-4 pb-5 space-y-3 overflow-y-auto max-h-[calc(85vh-24px)]">
          {/* Driver card — always visible */}
          <div className="flex items-center gap-3">
            <DriverPhoto src={b.driver_photo} name={b.driver_name} />
            <div className="flex-1 min-w-0">
              <div className="font-bold leading-tight truncate">{b.driver_name}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                <span className="font-semibold text-foreground">{b.driver_rating ?? "—"}</span>
                <span>({b.driver_trips ?? 0} trips)</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <PlateBadge plate={b.vehicle_number} />
                <span className="truncate text-xs text-muted-foreground">{b.vehicle_model ?? "—"}</span>
              </div>
            </div>
            {!shareView && (
              <div className="rounded-xl border border-primary/30 bg-primary-soft px-2.5 py-1.5 text-center">
                <div className="text-sm font-bold text-primary leading-none">{formatDuration(eta)}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">away</div>
              </div>
            )}
          </div>

          {/* Call / Chat / Share — always visible */}
          <div className={cn("grid gap-2", shareView ? "grid-cols-2" : "grid-cols-3")}>
            <a href={`tel:${b.driver_phone}`} className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm font-semibold text-primary">
              <Phone className="h-4 w-4" /> Call
            </a>
            <a
              href={b.driver_phone ? `https://wa.me/${String(b.driver_phone).replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hi, this is your Luxury Cabs customer for booking ${code}.`)}` : "#"}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm font-semibold"
            >
              <MessageSquare className="h-4 w-4" /> Chat
            </a>

            {!shareView && (
              <button
                onClick={shareTrip}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground"
              >
                <Share2 className="h-4 w-4" /> Share
              </button>
            )}
          </div>

          {/* Pull-up hint when collapsed and OTP is pending */}
          {!sheetExpanded && !shareView && phase !== "in_trip" && phase !== "completing" && (
            <button
              onClick={() => setSheetExpanded(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary-soft/40 py-2 text-xs font-semibold text-primary"
            >
              <ShieldCheck className="h-4 w-4" /> Pull up to view & share OTP
            </button>
          )}

          {/* Everything below is revealed only when the sheet is expanded */}
          {sheetExpanded && (
            <>
              {/* OTP block */}
              {!shareView && phase !== "in_trip" && phase !== "completing" && (
                <div className="rounded-2xl border border-primary/30 bg-primary-soft/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-primary">
                      <ShieldCheck className="h-4 w-4" /> Trip Start OTP
                    </div>
                    <button
                      onClick={resendOtp}
                      disabled={resending || resendCooldown > 0}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-card px-2.5 py-1 text-[11px] font-semibold text-primary disabled:opacity-50"
                    >
                      {resending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Resend"}
                      {resendCooldown > 0 ? ` (${resendCooldown}s)` : ""}
                    </button>
                  </div>
                  <div className="mt-2 flex justify-center gap-2">
                    {otpDigits.map((d, i) => (
                      <div key={i} className="grid h-12 w-12 place-items-center rounded-xl border-2 border-primary/40 bg-card text-xl font-bold text-primary">
                        {d.trim() || "•"}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-center text-[11px]">
                    {waitingChargesActive ? (
                      <span className="font-semibold text-amber-700">
                        OTP expired · Waiting charges have started
                      </span>
                    ) : phase === "arrived" || phase === "otp" ? (
                      <span className="text-muted-foreground">
                        Expires in <span className="font-semibold text-foreground">{mmss}</span> · Share with your driver
                      </span>
                    ) : (
                      <span className="text-muted-foreground">OTP timer starts when driver arrives</span>
                    )}
                  </div>
                </div>
              )}

              {/* Pickup / Drop */}
              <div className="rounded-2xl border border-border bg-background p-3">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase text-primary">Pickup</div>
                    <div className="text-xs font-semibold">{b.pickup_address}</div>
                  </div>
                </div>
                <div className="my-1.5 ml-1 h-3 w-px border-l-2 border-dashed border-muted-foreground/40" />
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase text-destructive">Drop</div>
                    <div className="text-xs font-semibold">{b.drop_address}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                  <span>{b.trip_type} · {Number(b.distance_km).toFixed(1)} km</span>
                  {!shareView && <span className="font-bold text-primary">{formatINR(Number(b.fare))}</span>}
                </div>
              </div>

              {/* Cancel */}
              {!shareView && (
                <button
                  onClick={() => setShowCancel(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 py-3 text-sm font-semibold text-destructive"
                >
                  <XCircle className="h-4 w-4" /> Cancel Ride
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {showCancel && !shareView && (
        <CancelReasonModal
          title="Cancel this ride?"
          onCancel={() => setShowCancel(false)}
          onConfirm={doCancel}
        />
      )}

      {!shareView && <UserPaymentOverlay b={b} />}
    </div>
  );
}

function UserPaymentOverlay({ b }: { b: Booking }) {
  const [busy, setBusy] = useState(false);
  const pStatus = (b.payment_status ?? "").toLowerCase();
  const pMethod = (b.payment_method ?? "").toLowerCase();

  // Driver has reached the drop and is waiting for the customer to pick a method.
  const needsChoice = pStatus === "awaiting" && !pMethod;
  // Customer picked Cash — waiting for driver to confirm cash received.
  const cashWaiting = pMethod === "cash" && b.status !== "completed";
  // Customer picked UPI — waiting for driver to confirm UPI received.
  const upiWaiting = pMethod === "upi" && b.status !== "completed";

  async function pickCash() {
    if (busy) return;
    setBusy(true);
    try {
      await updateBooking(b.id, { payment_method: "cash", payment_status: "cash_pending" } as any);
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(false); }
  }

  async function pickUpi(app?: "gpay" | "phonepe" | "paytm" | "any") {
    if (busy) return;
    setBusy(true);
    try {
      await updateBooking(b.id, {
        payment_method: "upi",
        payment_status: "upi_pending",
      } as any);
      // Open the chosen UPI app with merchant VPA + amount prefilled.
      const amount = Number(b.fare).toFixed(2);
      const pa = "mabubbasha9791-1@oksbi";
      const pn = encodeURIComponent("Luxury Cabs");
      const tn = encodeURIComponent(`Cab fare ${b.id.slice(0, 8)}`);
      const tr = b.id;
      const qs = `pa=${pa}&pn=${pn}&am=${amount}&cu=INR&tn=${tn}&tr=${tr}`;
      const scheme =
        app === "gpay" ? "tez://upi/pay" :
        app === "phonepe" ? "phonepe://pay" :
        app === "paytm" ? "paytmmp://pay" :
        "upi://pay";
      if (typeof window !== "undefined") {
        window.location.href = `${scheme}?${qs}`;
      }
    } catch (e: any) { toast.error(e.message || "Failed"); }
    finally { setBusy(false); }
  }

  if (!needsChoice && !cashWaiting && !upiWaiting) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-2xl sm:rounded-3xl animate-in slide-in-from-bottom-4 fade-in">
        {needsChoice && (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
              <CheckCircle2 className="h-7 w-7 text-primary" />
            </div>
            <div className="mt-3 text-center text-lg font-extrabold">You've reached your drop</div>
            <div className="text-center text-3xl font-extrabold text-primary mt-1">₹{Number(b.fare).toFixed(2)}</div>
            <div className="text-center text-[12px] text-muted-foreground">Choose your payment method to complete the trip</div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <PayBtn I={Banknote} l="Cash" onClick={pickCash} disabled={busy} />
              <PayBtn I={Wallet} l="UPI" onClick={() => pickUpi("any")} disabled={busy} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <UpiAppBtn label="Google Pay" color="bg-blue-50 text-blue-700 border-blue-200" onClick={() => pickUpi("gpay")} disabled={busy} />
              <UpiAppBtn label="PhonePe" color="bg-violet-50 text-violet-700 border-violet-200" onClick={() => pickUpi("phonepe")} disabled={busy} />
              <UpiAppBtn label="Paytm" color="bg-sky-50 text-sky-700 border-sky-200" onClick={() => pickUpi("paytm")} disabled={busy} />
            </div>
            <div className="mt-3 text-center text-[11px] text-muted-foreground">
              For UPI, your selected app will open with the amount prefilled. The driver confirms once payment is received.
            </div>
          </>
        )}

        {cashWaiting && (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100">
              <Banknote className="h-7 w-7 text-amber-600" />
            </div>
            <div className="mt-3 text-lg font-extrabold">Pay cash to the driver</div>
            <div className="mt-1 text-3xl font-extrabold text-primary">₹{Number(b.fare).toFixed(2)}</div>
            <div className="text-[12px] text-muted-foreground">Driver will confirm once cash is received.</div>
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for driver to confirm…
            </div>
          </div>
        )}

        {upiWaiting && (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft">
              <Wallet className="h-7 w-7 text-primary" />
            </div>
            <div className="mt-3 text-lg font-extrabold">Pay via UPI</div>
            <div className="mt-1 text-3xl font-extrabold text-primary">₹{Number(b.fare).toFixed(2)}</div>
            <div className="text-[12px] text-muted-foreground">
              Open your UPI app to complete the payment. The driver will confirm receipt.
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <UpiAppBtn label="Google Pay" color="bg-blue-50 text-blue-700 border-blue-200" onClick={() => pickUpi("gpay")} disabled={busy} />
              <UpiAppBtn label="PhonePe" color="bg-violet-50 text-violet-700 border-violet-200" onClick={() => pickUpi("phonepe")} disabled={busy} />
              <UpiAppBtn label="Paytm" color="bg-sky-50 text-sky-700 border-sky-200" onClick={() => pickUpi("paytm")} disabled={busy} />
            </div>
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for driver to confirm receipt…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function UpiAppBtn({ label, color, onClick, disabled }: { label: string; color: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn("rounded-xl border-2 py-2.5 text-xs font-bold transition disabled:opacity-50", color)}
    >
      {label}
    </button>
  );
}

function PayBtn({ I, l, onClick, disabled }: { I: any; l: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-xl border-2 border-border bg-background p-4 text-sm font-semibold transition hover:border-primary disabled:opacity-50"
    >
      <I className="h-6 w-6 text-primary" /> {l}
    </button>
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


