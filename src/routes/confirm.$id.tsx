import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, CreditCard, Banknote, Wallet, ShieldCheck, Loader2, MapPin, Clock, Car } from "lucide-react";
import { motion } from "framer-motion";
import { getBooking, updateBooking, type Booking } from "@/lib/booking-store";
import { RouteMap } from "@/components/RouteMap";
import { formatINR, tariffFor } from "@/lib/fare";
import { pickDemoDriver } from "@/lib/drivers";
import { computeRoute } from "@/lib/maps/routes.functions";
import { offsetLatLng } from "@/lib/maps/sim";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirm/$id")({
  head: () => ({ meta: [{ title: "Confirm Ride — Luxury Cabs" }] }),
  component: Confirm,
});

function Confirm() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [b, setB] = useState<Booking | null>(null);
  const [pay, setPay] = useState<"cash" | "upi" | "card">("cash");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<"idle" | "finding">("idle");

  useEffect(() => { getBooking(id).then(setB); }, [id]);

  async function confirmRide() {
    if (!b || busy) return;
    setBusy(true);
    try {
      await updateBooking(b.id, { payment_method: pay });
      setStage("finding");

      // Simulate driver search (3-6s) — admin assignment will replace this later
      const wait = 3000 + Math.random() * 3000;
      await new Promise((r) => setTimeout(r, wait));

      const driver = pickDemoDriver(b.vehicle_type as "sedan" | "suv");
      // Place driver 1.5-3 km from pickup at random bearing
      const startKm = 1.5 + Math.random() * 1.5;
      const startBearing = Math.random() * 360;
      const driverPos = offsetLatLng(
        { lat: b.pickup_lat, lng: b.pickup_lng },
        startKm, startBearing
      );

      // Compute driver -> pickup route
      let toPickupPoly: string | null = null;
      try {
        const r = await computeRoute({
          data: {
            origin: driverPos,
            destination: { lat: b.pickup_lat, lng: b.pickup_lng },
          },
        });
        toPickupPoly = r.polyline;
      } catch (e) { console.error(e); }

      await updateBooking(b.id, {
        status: "driver_assigned",
        driver_name: driver.name,
        driver_phone: driver.phone,
        driver_photo: driver.photo,
        driver_rating: driver.rating,
        driver_trips: driver.trips,
        vehicle_number: driver.vehicle_number,
        vehicle_model: driver.vehicle_model,
        driver_lat: driverPos.lat,
        driver_lng: driverPos.lng,
        // Stash driver->pickup polyline in route_polyline only if main route missing (rental)
        route_polyline: b.route_polyline ?? toPickupPoly,
      });

      // Pass to-pickup polyline via session storage for tracker
      if (toPickupPoly) sessionStorage.setItem(`toPickup:${b.id}`, toPickupPoly);
      navigate({ to: "/track/$id", params: { id: b.id } });
    } catch (e) {
      console.error(e);
      alert("Failed to confirm. Try again.");
      setStage("idle");
    } finally { setBusy(false); }
  }

  if (!b) {
    return (
      <div className="app-shell grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const tariff = tariffFor(b.vehicle_type as "sedan" | "suv");

  if (stage === "finding") {
    return (
      <div className="app-shell flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-primary-soft/40 to-background p-6 text-center">
        <div className="relative h-40 w-40">
          <motion.div
            className="absolute inset-0 rounded-full bg-primary/20"
            animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="absolute inset-4 rounded-full bg-primary/30"
            animate={{ scale: [1, 1.4, 1], opacity: [0.7, 0.1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
          />
          <div className="absolute inset-10 grid place-items-center rounded-full bg-primary text-primary-foreground shadow-xl">
            <Car className="h-10 w-10" />
          </div>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-primary">Finding your driver</h2>
          <p className="mt-1 text-sm text-muted-foreground">Connecting you with a nearby verified driver…</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 text-xs text-muted-foreground shadow">
          <ShieldCheck className="h-4 w-4 text-primary" /> 100% Safe & Verified
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell flex flex-col bg-background pb-40">
      <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
        <button onClick={() => history.back()} className="rounded-full p-2 hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="font-display text-lg font-bold">Confirm Booking</div>
      </div>

      <div className="p-4">
        <RouteMap
          pickup={{ lat: b.pickup_lat, lng: b.pickup_lng }}
          drop={{ lat: b.drop_lat, lng: b.drop_lng }}
          polyline={b.route_polyline}
          height={200}
        />
      </div>

      <div className="mx-4 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />
          <div className="flex-1">
            <div className="text-[11px] font-semibold text-primary">PICKUP</div>
            <div className="text-sm font-semibold">{b.pickup_address}</div>
          </div>
        </div>
        <div className="my-3 ml-1 h-6 w-px border-l-2 border-dashed border-muted-foreground/40" />
        <div className="flex items-start gap-3">
          <MapPin className="h-4 w-4 text-destructive" />
          <div className="flex-1">
            <div className="text-[11px] font-semibold text-destructive">DROP</div>
            <div className="text-sm font-semibold">{b.drop_address}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5"><Car className="h-3.5 w-3.5 text-primary" /> {tariff.label}</span>
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {b.duration_min} min · {Number(b.distance_km).toFixed(1)} km</span>
        </div>
      </div>

      <div className="mx-4 mt-4">
        <div className="text-sm font-semibold">Payment Method</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { id: "cash" as const, I: Banknote, l: "Cash" },
            { id: "upi"  as const, I: Wallet,    l: "UPI"  },
            { id: "card" as const, I: CreditCard, l: "Card" },
          ].map(({ id, I, l }) => (
            <button
              key={id}
              onClick={() => setPay(id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border-2 bg-card p-3 text-xs font-semibold",
                pay === id ? "border-primary bg-primary-soft text-primary" : "border-border"
              )}
            >
              <I className="h-5 w-5" />{l}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Fare Summary</div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Trip fare</span>
          <span>{formatINR(Number(b.fare))}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
          <span>Taxes & fees included</span>
          <span>—</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="font-bold">Total</span>
          <span className="text-xl font-bold text-primary">{formatINR(Number(b.fare))}</span>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[480px] border-t border-border bg-background p-3">
        <button
          onClick={confirmRide}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Confirm Booking</>}
        </button>
        <Link to="/booking" className="mt-2 block text-center text-xs text-muted-foreground">Cancel</Link>
      </div>
    </div>
  );
}
