import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Phone, MessageSquare, Shield, Star, Loader2, KeyRound } from "lucide-react";
import { motion } from "framer-motion";
import { getBooking, updateBooking, type Booking } from "@/lib/booking-store";
import { RouteMap } from "@/components/RouteMap";
import { simulateDrive, type LatLng } from "@/lib/maps/sim";
import { computeRoute } from "@/lib/maps/routes.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/track/$id")({
  head: () => ({ meta: [{ title: "Live Tracking — Luxury Cabs" }] }),
  component: Track,
});

type Phase = "to_pickup" | "arrived" | "otp" | "in_trip" | "completing";

function Track() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [b, setB] = useState<Booking | null>(null);
  const [driver, setDriver] = useState<LatLng | null>(null);
  const [phase, setPhase] = useState<Phase>("to_pickup");
  const [eta, setEta] = useState<number>(0);
  const [tripPoly, setTripPoly] = useState<string | null>(null);
  const [toPickupPoly, setToPickupPoly] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const cancelRef = useRef<(() => void) | null>(null);

  // Load booking
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

  // Driver -> pickup animation
  useEffect(() => {
    if (!b || phase !== "to_pickup") return;
    const poly = sessionStorage.getItem(`toPickup:${b.id}`);
    if (!poly) return;
    const totalMs = 12000 + Math.random() * 8000; // 12-20s simulated
    setEta(Math.ceil(totalMs / 1000 / 60) || 1);
    cancelRef.current?.();
    cancelRef.current = simulateDrive({
      polyline: poly,
      totalMs,
      intervalMs: 2200,
      onTick: (p, prog) => {
        setDriver(p);
        setEta(Math.max(1, Math.ceil((totalMs * (1 - prog)) / 60000)));
        updateBooking(b.id, { driver_lat: p.lat, driver_lng: p.lng }).catch(() => {});
      },
      onDone: () => {
        updateBooking(b.id, { status: "driver_arrived", driver_lat: b.pickup_lat, driver_lng: b.pickup_lng }).catch(() => {});
        setDriver({ lat: b.pickup_lat, lng: b.pickup_lng });
        setPhase("arrived");
      },
    });
    return () => cancelRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id, phase]);

  // Trip animation (pickup -> drop) after OTP verified
  useEffect(() => {
    if (!b || phase !== "in_trip") return;
    // Use existing route polyline (for local/outstation). For rental compute on the fly.
    (async () => {
      let poly = b.route_polyline;
      if (!poly || b.trip_type === "rental") {
        try {
          const r = await computeRoute({
            data: {
              origin: { lat: b.pickup_lat, lng: b.pickup_lng },
              destination: { lat: b.drop_lat, lng: b.drop_lng },
            },
          });
          poly = r.polyline;
        } catch (e) { console.error(e); }
      }
      if (!poly) return;
      setTripPoly(poly);
      const totalMs = Math.max(15000, Math.min(60000, b.duration_min * 1000)); // simulated 15-60s
      cancelRef.current?.();
      cancelRef.current = simulateDrive({
        polyline: poly,
        totalMs,
        intervalMs: 2400,
        onTick: (p, prog) => {
          setDriver(p);
          setEta(Math.max(1, Math.ceil((totalMs * (1 - prog)) / 60000)));
          updateBooking(b.id, { driver_lat: p.lat, driver_lng: p.lng }).catch(() => {});
        },
        onDone: async () => {
          setPhase("completing");
          await updateBooking(b.id, {
            status: "completed",
            driver_lat: b.drop_lat, driver_lng: b.drop_lng,
            completed_at: new Date().toISOString(),
          });
          navigate({ to: "/complete/$id", params: { id: b.id } });
        },
      });
    })();
    return () => cancelRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id, phase]);

  function verifyOtp() {
    if (!b) return;
    if (otp.trim() === b.otp) {
      setOtpError("");
      updateBooking(b.id, { status: "in_progress" }).catch(() => {});
      setPhase("in_trip");
    } else {
      setOtpError("Invalid OTP. Please ask the driver again.");
    }
  }

  if (!b) {
    return <div className="app-shell grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const mapPickup = { lat: b.pickup_lat, lng: b.pickup_lng };
  const mapDrop = { lat: b.drop_lat, lng: b.drop_lng };

  return (
    <div className="app-shell flex flex-col bg-background">
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <button onClick={() => navigate({ to: "/home" })} className="rounded-full p-2 hover:bg-muted">
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
            {phase === "to_pickup" && `Arriving in ~${eta} min`}
            {phase === "arrived" && "Meet the driver at pickup"}
            {phase === "in_trip" && `~${eta} min to drop`}
          </div>
        </div>
      </div>

      <div className="px-3 pt-3">
        <RouteMap
          pickup={mapPickup}
          drop={mapDrop}
          polyline={phase === "in_trip" || phase === "completing" ? (tripPoly ?? b.route_polyline) : sessionStorage.getItem(`toPickup:${b.id}`) ?? b.route_polyline}
          driver={driver}
          height={280}
        />
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

      {/* OTP sheet */}
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
          <p className="mt-3 text-center text-xs text-muted-foreground">For demo, enter the OTP shown above to start the trip.</p>
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
