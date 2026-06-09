import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft, CreditCard, Banknote, Wallet, Loader2, MapPin, Clock, Car, X,
} from "lucide-react";
import { getBooking, updateBooking, type Booking } from "@/lib/booking-store";
import { RouteMap } from "@/components/RouteMap";

import {
  calcLocalFare, calcOutstationFare, formatINR, tariffFor, useFareRates,
  VEHICLE_MODELS, modelFare, type VehicleType, type VehicleModel, type RatesMap,
} from "@/lib/fare";
import sedanImg from "@/assets/sedan.png";
import suvImg from "@/assets/suv.png";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/confirm/$id")({
  head: () => ({ meta: [{ title: "Confirm Booking — Luxury Cabs" }] }),
  component: Confirm,
});

function recalcFare(b: Booking, v: VehicleType, rates?: RatesMap): number {
  if (b.trip_type === "outstation") return calcOutstationFare(v, Number(b.distance_km), rates);
  return calcLocalFare(v, Number(b.distance_km), b.duration_min, rates);
}

function Confirm() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [b, setB] = useState<Booking | null>(null);
  const [pay, setPay] = useState<"cash" | "upi" | "card">("cash");
  const [busy, setBusy] = useState(false);
  const [vehSheet, setVehSheet] = useState(false);

  useEffect(() => { getBooking(id).then(setB); }, [id]);

  async function pickModel(m: VehicleModel) {
    if (!b) return;
    const tierFares = {
      sedan: recalcFare(b, "sedan"),
      suv: recalcFare(b, "suv"),
    };
    const fare = modelFare(m, tierFares);
    const updated = await updateBooking(b.id, {
      vehicle_type: m.tier,
      vehicle_model: m.label,
      fare,
    });
    setB(updated);
    setVehSheet(false);
  }

  async function confirmRide() {
    if (!b || busy) return;
    setBusy(true);
    try {
      await updateBooking(b.id, { payment_method: pay, status: "pending" });
      navigate({ to: "/track/$id", params: { id: b.id } });
    } catch (e) {
      console.error(e);
      alert("Failed to confirm. Try again.");
    } finally { setBusy(false); }
  }

  if (!b) {
    return (
      <div className="app-shell grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const tariff = tariffFor(b.vehicle_type as VehicleType);

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

      {/* Vehicle card with Change Vehicle */}
      <div className="mx-4 mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Selected Vehicle</div>
          <button
            onClick={() => setVehSheet(true)}
            className="rounded-md border border-border bg-card px-3 py-1 text-xs font-semibold hover:bg-muted"
          >
            Change Vehicle
          </button>
        </div>
        <button
          onClick={() => setVehSheet(true)}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-foreground bg-white p-3 text-left"
        >
          <div className="grid h-16 w-24 shrink-0 place-items-center rounded-xl bg-white">
            <img
              src={b.vehicle_type === "suv" ? suvImg : sedanImg}
              alt={b.vehicle_model ?? tariff.label}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold">{b.vehicle_model ?? tariff.label}</div>
            <div className="text-xs text-muted-foreground">{tariff.seats} Seats · AC</div>
          </div>
          <div className="text-base font-bold">{formatINR(Number(b.fare))}</div>
        </button>
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
                pay === id ? "border-foreground text-foreground" : "border-border text-muted-foreground"
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

      {/* Change Vehicle sheet — specific models */}
      {vehSheet && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setVehSheet(false)} />
          <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] max-w-[480px] overflow-y-auto rounded-t-3xl border-t border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="font-display text-lg font-bold">Change Vehicle</div>
              <button onClick={() => setVehSheet(false)} className="rounded-md p-1 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            {(["sedan", "suv"] as const).map((tier) => {
              const tierFares = { sedan: recalcFare(b, "sedan"), suv: recalcFare(b, "suv") };
              const img = tier === "sedan" ? sedanImg : suvImg;
              return (
                <div key={tier} className="mb-4">
                  <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {tier === "sedan" ? "Sedan" : "SUV"}
                  </div>
                  <div className="space-y-2">
                    {VEHICLE_MODELS.filter((m) => m.tier === tier).map((m) => {
                      const fare = modelFare(m, tierFares);
                      const selected = b.vehicle_model === m.label;
                      return (
                        <button
                          key={m.id}
                          onClick={() => pickModel(m)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left transition",
                            selected ? "border-foreground" : "border-border hover:border-foreground/30"
                          )}
                        >
                          <div className="grid h-16 w-24 shrink-0 place-items-center rounded-xl bg-white">
                            <img src={img} alt={m.label} className="h-full w-full object-contain" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-foreground">{m.label}</div>
                            <div className="text-xs text-muted-foreground">{m.seats} Seats · AC</div>
                          </div>
                          <div className="text-right">
                            <div className="text-base font-bold">{formatINR(fare)}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
