import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, Calendar, ChevronDown, Car, Map as MapIcon, Clock, ArrowUpDown, ArrowRight, ShieldCheck, Loader2 } from "lucide-react";
import { z } from "zod";
import { BrandHeader } from "@/components/Brand";
import { PlaceAutocomplete, type PlacePick } from "@/components/PlaceAutocomplete";
import { VehicleCard } from "@/components/VehicleCard";
import {
  RENTAL_PACKAGES, calcLocalFare, calcOutstationFare, formatINR,
  type TripType, type VehicleType,
} from "@/lib/fare";
import { computeRoute } from "@/lib/maps/routes.functions";
import { createBooking, pushRecentBooking } from "@/lib/booking-store";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ tab: z.enum(["local", "outstation", "rental"]).optional() });

export const Route = createFileRoute("/_app/booking")({
  head: () => ({ meta: [{ title: "Book a Ride — Luxury Cabs" }] }),
  validateSearch: searchSchema,
  component: Booking,
});

function Booking() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TripType>(search.tab ?? "local");
  const [pickup, setPickup] = useState<PlacePick | null>(null);
  const [drop, setDrop] = useState<PlacePick | null>(null);
  const [tripMode, setTripMode] = useState<"oneway" | "round">("oneway");
  const [pkgId, setPkgId] = useState<string>(RENTAL_PACKAGES[0].id);
  const [vehicle, setVehicle] = useState<VehicleType>("sedan");
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date(Date.now() + 15 * 60_000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number; polyline: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { setRouteInfo(null); }, [pickup, drop]);

  useEffect(() => {
    if (!pickup || !drop || tab === "rental") return;
    let cancelled = false;
    setRouteLoading(true);
    computeRoute({ data: { origin: { lat: pickup.lat, lng: pickup.lng }, destination: { lat: drop.lat, lng: drop.lng } } })
      .then((r) => { if (!cancelled) setRouteInfo(r); })
      .catch((e) => console.error(e))
      .finally(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
  }, [pickup, drop, tab]);

  const fares = useMemo(() => {
    if (tab === "rental") {
      const pkg = RENTAL_PACKAGES.find((p) => p.id === pkgId)!;
      return { sedan: pkg.sedan, suv: pkg.suv };
    }
    if (!routeInfo) return { sedan: 0, suv: 0 };
    const km = tripMode === "round" && tab === "outstation" ? routeInfo.distanceKm * 2 : routeInfo.distanceKm;
    if (tab === "outstation") {
      return { sedan: calcOutstationFare("sedan", km), suv: calcOutstationFare("suv", km) };
    }
    return {
      sedan: calcLocalFare("sedan", km, routeInfo.durationMin),
      suv: calcLocalFare("suv", km, routeInfo.durationMin),
    };
  }, [tab, tripMode, routeInfo, pkgId]);

  const estimatedFare = vehicle === "sedan" ? fares.sedan : fares.suv;

  function swap() {
    setPickup(drop);
    setDrop(pickup);
  }

  const canBook = (() => {
    if (!pickup || !drop) return false;
    if (tab === "rental") return true;
    return !!routeInfo && !routeLoading;
  })();

  async function handleBook() {
    if (!pickup || !drop || submitting) return;
    setSubmitting(true);
    try {
      const pkg = RENTAL_PACKAGES.find((p) => p.id === pkgId);
      const distance =
        tab === "rental" ? pkg!.km :
        tab === "outstation" && tripMode === "round" ? (routeInfo!.distanceKm * 2) :
        routeInfo!.distanceKm;
      const duration =
        tab === "rental" ? pkg!.hours * 60 :
        tab === "outstation" && tripMode === "round" ? routeInfo!.durationMin * 2 :
        routeInfo!.durationMin;

      const booking = await createBooking({
        trip_type: tab,
        trip_mode: tab === "outstation" ? tripMode : null,
        package_label: tab === "rental" ? pkg!.label : null,
        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        drop_address: drop.address,
        drop_lat: drop.lat,
        drop_lng: drop.lng,
        scheduled_at: new Date(scheduledAt).toISOString(),
        vehicle_type: vehicle,
        distance_km: Number(distance.toFixed(2)),
        duration_min: Math.round(duration),
        fare: estimatedFare,
        route_polyline: tab === "rental" ? null : routeInfo!.polyline,
      });
      pushRecentBooking(booking.id);
      navigate({ to: "/confirm/$id", params: { id: booking.id } });
    } catch (e) {
      console.error(e);
      alert("Could not create booking. Please try again.");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="flex flex-col gap-4 pb-32">
      <BrandHeader right={<Bell className="h-5 w-5 text-foreground" />} />

      {/* Tabs */}
      <div className="mx-4 grid grid-cols-3 gap-2">
        {([
          { id: "local", label: "Local Trip", I: Car },
          { id: "outstation", label: "Outstation", I: MapIcon },
          { id: "rental", label: "Rental", I: Clock },
        ] as const).map(({ id, label, I }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-2.5 text-xs font-semibold transition",
              tab === id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
            )}
          >
            <I className="h-4 w-4" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {/* Locations */}
      <div className="mx-4 relative rounded-2xl border border-border bg-card p-4">
        <div className="absolute left-7 top-12 h-10 w-px border-l-2 border-dashed border-muted-foreground/40" />
        <PlaceAutocomplete
          label={tab === "outstation" ? "From (Pickup Location)" : "Pickup Location"}
          value={pickup}
          onChange={setPickup}
          placeholder="Search pickup"
        />
        <div className="my-4 h-px bg-border" />
        <PlaceAutocomplete
          label={tab === "outstation" ? "To (Drop Location)" : "Drop Location"}
          value={drop}
          onChange={setDrop}
          placeholder="Search drop"
          accent="red"
        />
        <button
          onClick={swap}
          className="absolute right-3 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full border border-border bg-background shadow"
          aria-label="Swap"
        >
          <ArrowUpDown className="h-4 w-4 text-primary" />
        </button>
      </div>

      {/* Outstation: one way / round trip */}
      {tab === "outstation" && (
        <div className="mx-4 grid grid-cols-2 gap-3">
          {(["oneway", "round"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTripMode(m)}
              className={cn(
                "rounded-xl border-2 py-3 text-sm font-semibold",
                tripMode === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
              )}
            >
              {m === "oneway" ? <><ArrowRight className="mx-auto mb-1 h-4 w-4" />One Way</> : <>↺ Round Trip</>}
            </button>
          ))}
        </div>
      )}

      {/* Schedule */}
      <div className="mx-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-3">
        <Calendar className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Schedule Time</span>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="ml-auto bg-transparent text-sm text-foreground outline-none"
        />
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Rental packages */}
      {tab === "rental" && (
        <div className="mx-4">
          <div className="text-sm font-semibold">Choose a Package</div>
          <div className="mt-2 space-y-2">
            {RENTAL_PACKAGES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPkgId(p.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border-2 bg-card p-3 text-left",
                  pkgId === p.id ? "border-primary bg-primary-soft" : "border-border"
                )}
              >
                <span className={cn("grid h-5 w-5 place-items-center rounded-full border-2",
                  pkgId === p.id ? "border-primary bg-primary" : "border-muted-foreground/40")}>
                  {pkgId === p.id && <span className="h-2 w-2 rounded-full bg-primary-foreground" />}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.sub}</div>
                </div>
                <div className="font-bold text-primary">{formatINR(vehicle === "sedan" ? p.sedan : p.suv)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Vehicle selection */}
      <div className="mx-4">
        <div className="text-sm font-semibold">Select Vehicle</div>
        <div className="text-xs text-muted-foreground">Choose the best ride for your {tab} trip</div>
        {routeLoading && tab !== "rental" && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculating route & fare…
          </div>
        )}
        <div className="mt-3 space-y-3">
          <VehicleCard
            type="sedan" fare={fares.sedan}
            selected={vehicle === "sedan"} onSelect={() => setVehicle("sedan")}
            badge="Best Value"
            subline={tab === "rental"
              ? `${RENTAL_PACKAGES.find(p => p.id === pkgId)!.hours} Hrs / ${RENTAL_PACKAGES.find(p => p.id === pkgId)!.km} KM`
              : routeInfo ? `~${routeInfo.durationMin} min · ${routeInfo.distanceKm.toFixed(1)} km` : "Enter pickup & drop"}
          />
          <VehicleCard
            type="suv" fare={fares.suv}
            selected={vehicle === "suv"} onSelect={() => setVehicle("suv")}
            badge="Most Popular"
            subline={tab === "rental"
              ? `${RENTAL_PACKAGES.find(p => p.id === pkgId)!.hours} Hrs / ${RENTAL_PACKAGES.find(p => p.id === pkgId)!.km} KM`
              : routeInfo ? `~${routeInfo.durationMin} min · ${routeInfo.distanceKm.toFixed(1)} km` : "Enter pickup & drop"}
          />
        </div>
      </div>

      {tab === "outstation" && (
        <div className="mx-4 flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-xs text-foreground/80">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          Toll, State Tax, Driver Allowance included in the fare
        </div>
      )}

      {/* Bottom CTA */}
      <div className="fixed inset-x-0 bottom-[64px] z-20 mx-auto max-w-[480px] px-3 pb-2 pt-2">
        <div className="flex items-center gap-3 rounded-2xl bg-primary p-3 text-primary-foreground shadow-2xl">
          <div className="flex-1">
            <div className="text-[11px] opacity-80">{tab === "rental" ? "Package Fare" : "Estimated Fare"}</div>
            <div className="text-xl font-bold">{formatINR(estimatedFare)}</div>
            <div className="text-[10px] opacity-70">Inclusive of all taxes</div>
          </div>
          <button
            disabled={!canBook || submitting}
            onClick={handleBook}
            className="flex items-center gap-2 rounded-xl bg-primary-foreground px-5 py-3 text-sm font-bold text-primary disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Book Now"}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
