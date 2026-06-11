import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar, Car, Map as MapIcon, Clock, ArrowUpDown, ArrowRight,
  Loader2, X, Pencil, ShieldCheck, Bell,
} from "lucide-react";
import { z } from "zod";
import { PlaceAutocomplete, type PlacePick } from "@/components/PlaceAutocomplete";
import { VehicleCard } from "@/components/VehicleCard";
import { RouteMap } from "@/components/RouteMap";
import { CrownCarLogo } from "@/components/Brand";
import { Sheet, SheetContent } from "@/components/ui/sheet";

import {
  RENTAL_PACKAGES, calcLocalFare, calcOutstationFare, formatINR, useFareRates,
  fareBreakdown, tariffFor,
  type TripType, type VehicleType,
} from "@/lib/fare";
import { computeRoute } from "@/lib/maps/routes.functions";
import { createBooking, pushRecentBooking } from "@/lib/booking-store";
import { cn } from "@/lib/utils";
import sedanImg from "@/assets/sedan.png";
import suvImg from "@/assets/suv.png";

const searchSchema = z.object({ tab: z.enum(["local", "outstation", "rental"]).optional() });

export const Route = createFileRoute("/_app/booking")({
  head: () => ({ meta: [{ title: "Book a Ride — Luxury Cabs" }] }),
  validateSearch: searchSchema,
  component: Booking,
});

function Booking() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { rates } = useFareRates();
  const [tab, setTab] = useState<TripType>(search.tab ?? "local");
  const [pickup, setPickup] = useState<PlacePick | null>(null);
  const [drop, setDrop] = useState<PlacePick | null>(null);
  const [tripMode, setTripMode] = useState<"oneway" | "round">("oneway");
  const [pkgId, setPkgId] = useState<string>(RENTAL_PACKAGES[0].id);
  const [vehicle, setVehicle] = useState<VehicleType>("sedan");
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date(Date.now() + 15 * 60_000);
    d.setSeconds(0, 0);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
  });
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number; polyline: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
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
  const effectiveTab: TripType = tab;

  const fares = useMemo(() => {
    if (tab === "rental") {
      const pkg = RENTAL_PACKAGES.find((p) => p.id === pkgId)!;
      return { sedan: pkg.sedan, suv: pkg.suv };
    }
    if (!routeInfo) return { sedan: 0, suv: 0 };
    const km = tripMode === "round" && effectiveTab === "outstation" ? routeInfo.distanceKm * 2 : routeInfo.distanceKm;
    if (effectiveTab === "outstation") {
      return { sedan: calcOutstationFare("sedan", km, rates), suv: calcOutstationFare("suv", km, rates) };
    }
    return {
      sedan: calcLocalFare("sedan", km, routeInfo.durationMin, rates),
      suv: calcLocalFare("suv", km, routeInfo.durationMin, rates),
    };
  }, [tab, effectiveTab, tripMode, routeInfo, pkgId, rates]);

  const estimatedFare = vehicle === "sedan" ? fares.sedan : fares.suv;

  function swap() { setPickup(drop); setDrop(pickup); }

  const canBook = (() => {
    if (!pickup || !drop) return false;
    if (tab === "rental") return true;
    return !!routeInfo && !routeLoading && estimatedFare > 0;
  })();

  const breakdown = useMemo(() => {
    if (tab === "rental" || !routeInfo) return null;
    const km = tripMode === "round" && effectiveTab === "outstation" ? routeInfo.distanceKm * 2 : routeInfo.distanceKm;
    return fareBreakdown(vehicle, km, routeInfo.durationMin, rates);
  }, [tab, effectiveTab, tripMode, routeInfo, vehicle, rates]);

  async function handleBook() {
    if (!pickup || !drop || submitting) return;
    setSubmitting(true);
    try {
      const pkg = RENTAL_PACKAGES.find((p) => p.id === pkgId);
      const distance =
        tab === "rental" ? pkg!.km :
        effectiveTab === "outstation" && tripMode === "round" ? (routeInfo!.distanceKm * 2) :
        routeInfo!.distanceKm;
      const duration =
        tab === "rental" ? pkg!.hours * 60 :
        effectiveTab === "outstation" && tripMode === "round" ? routeInfo!.durationMin * 2 :
        routeInfo!.durationMin;

      const booking = await createBooking({
        trip_type: effectiveTab,
        trip_mode: effectiveTab === "outstation" ? tripMode : null,
        package_label: tab === "rental" ? pkg!.label : null,
        pickup_address: pickup.address,
        pickup_lat: pickup.lat,
        pickup_lng: pickup.lng,
        drop_address: drop.address,
        drop_lat: drop.lat,
        drop_lng: drop.lng,
        scheduled_at: new Date(scheduledAt).toISOString(),
        vehicle_type: vehicle,
        vehicle_model: vehicle === "sedan" ? "Sedan" : "SUV",
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

  const tariff = tariffFor(vehicle);
  const carImg = vehicle === "sedan" ? sedanImg : suvImg;

  return (
    <div className="flex flex-col gap-3 pb-40">
      {/* Header with crown */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
        <CrownCarLogo className="h-6 w-6" />
        <div className="font-display text-lg font-bold tracking-tight text-primary">Luxury Cabs</div>
        <button className="absolute right-4 grid h-9 w-9 place-items-center rounded-full border border-border bg-card" aria-label="Notifications">
          <Bell className="h-4 w-4 text-foreground" />
        </button>
      </div>

      {/* Tabs */}
      <div className="mx-4 grid grid-cols-3 gap-2">
        {([
          { id: "local", label: "Local", I: Car },
          { id: "rental", label: "Rental", I: Clock },
          { id: "outstation", label: "Outstation", I: MapIcon },
        ] as const).map(({ id, label, I }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-full border-2 px-2 py-2.5 text-xs font-semibold transition",
              tab === id ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-muted-foreground"
            )}
          >
            <I className="h-4 w-4" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Pickup / Drop */}
      <div className="mx-4 relative rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="absolute left-6 top-12 h-10 w-px border-l-2 border-dashed border-muted-foreground/40" />
        <PlaceAutocomplete
          label="Pickup Location"
          value={pickup}
          onChange={setPickup}
          placeholder="Search pickup"
          autoDetect
        />
        <div className="my-3 h-px bg-border" />
        <PlaceAutocomplete
          label="Drop Location"
          value={drop}
          onChange={setDrop}
          placeholder="Where to go?"
          accent="green"
        />
        <button
          onClick={swap}
          className="absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full border border-border bg-background shadow"
          aria-label="Swap"
        >
          <ArrowUpDown className="h-4 w-4 text-foreground" />
        </button>
      </div>

      {/* Map */}
      {pickup && drop && tab !== "rental" && (
        <div className="mx-4">
          <RouteMap
            pickup={{ lat: pickup.lat, lng: pickup.lng }}
            drop={{ lat: drop.lat, lng: drop.lng }}
            polyline={routeInfo?.polyline ?? null}
            height={240}
          />
        </div>
      )}

      {/* Outstation mode */}
      {effectiveTab === "outstation" && (
        <div className="mx-4 grid grid-cols-2 gap-3">
          {(["oneway", "round"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTripMode(m)}
              className={cn(
                "rounded-xl border-2 py-2.5 text-sm font-semibold",
                tripMode === m ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-muted-foreground"
              )}
            >
              {m === "oneway" ? "One Way" : "Round Trip"}
            </button>
          ))}
        </div>
      )}

      {/* Date & time */}
      <div className="mx-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-3">
        <Calendar className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Date & Time</span>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="ml-auto bg-transparent text-sm text-foreground outline-none"
        />
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
                  pkgId === p.id ? "border-primary" : "border-border"
                )}
              >
                <span className={cn("grid h-5 w-5 place-items-center rounded-full border-2",
                  pkgId === p.id ? "border-primary bg-primary" : "border-muted-foreground/40")}>
                  {pkgId === p.id && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.sub}</div>
                </div>
                <div className="font-bold text-foreground">
                  {formatINR(vehicle === "sedan" ? p.sedan : p.suv)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Vehicle picker */}
      <div className="mx-4">
        <div className="text-base font-bold">Select Vehicle</div>
        {routeLoading && tab !== "rental" && (
          <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculating route & fare…
          </div>
        )}
        <div className="mt-2 space-y-2">
          <VehicleCard type="sedan" fare={fares.sedan} selected={vehicle === "sedan"} onSelect={() => setVehicle("sedan")} />
          <VehicleCard type="suv" fare={fares.suv} selected={vehicle === "suv"} onSelect={() => setVehicle("suv")} />
        </div>
      </div>

      {/* Bottom CTA → opens summary sheet */}
      {canBook && (
        <div className="fixed inset-x-0 bottom-[64px] z-20 mx-auto max-w-[480px] animate-in slide-in-from-bottom px-3 pb-2 pt-2">
          <div className="rounded-2xl bg-card p-3 shadow-2xl ring-1 ring-border">
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <div className="text-[11px] text-muted-foreground">{tab === "rental" ? "Package Fare" : "Estimated Fare"}</div>
                <div className="text-xl font-bold text-foreground">{formatINR(estimatedFare)}</div>
              </div>
              <div className="text-right text-[11px] text-muted-foreground">
                <div className="font-semibold text-foreground">{vehicle === "sedan" ? "Sedan" : "SUV"}</div>
                <div>Inclusive of all taxes</div>
              </div>
            </div>
            <button
              onClick={() => setSummaryOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg"
            >
              Review Trip <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Trip Summary Sheet */}
      <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-0 p-0 max-h-[92vh] overflow-y-auto">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30 mt-3" />
          <button
            onClick={() => setSummaryOpen(false)}
            className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="px-5 pb-6 pt-5">
            <div className="flex flex-col items-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-primary">
                <CrownCarLogo className="h-7 w-7 text-primary-foreground" />
              </div>
              <div className="mt-2 text-xs font-bold tracking-wide text-primary">LUXURY CABS</div>
            </div>

            <h2 className="mt-4 text-center text-lg font-bold">Trip Summary</h2>

            {/* Route card */}
            <div className="relative mt-4 rounded-2xl border border-border bg-card p-4">
              <div className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-bl-xl rounded-tr-2xl bg-primary text-primary-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </div>
              <div className="flex">
                <div className="mr-3 flex flex-col items-center pt-1">
                  <span className="h-3 w-3 rounded-full border-2 border-primary" />
                  <span className="my-1 h-8 w-px border-l-2 border-dashed border-muted-foreground/40" />
                  <span className="h-3 w-3 rounded-sm bg-rose-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm font-medium truncate">{pickup?.address}</div>
                    <div className="text-right text-xs font-semibold text-muted-foreground shrink-0">
                      {tab === "outstation" ? (tripMode === "round" ? "Round" : "One Way") : tab === "rental" ? "Rental" : "Local"}
                    </div>
                  </div>
                  <div className="mt-5 flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm font-medium truncate">{drop?.address}</div>
                    {routeInfo && (
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        <div className="font-bold text-foreground">{routeInfo.distanceKm.toFixed(1)} km</div>
                        <div>{routeInfo.durationMin} min</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected vehicle */}
            <div className="relative mt-3 rounded-2xl border border-border bg-card p-4">
              <div className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-bl-xl rounded-tr-2xl bg-primary text-primary-foreground">
                <Pencil className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-3">
                <img src={carImg} alt={tariff.label} className="h-14 w-20 object-contain" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">Selected Vehicle</div>
                  <div className="text-base font-bold">{tariff.label}</div>
                  <div className="text-[11px] text-muted-foreground">{tariff.seats} Seats · {tariff.bags} Bags</div>
                </div>
                <div className="text-right">
                  <div className="text-base font-extrabold text-primary">{formatINR(estimatedFare)}</div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                {breakdown ? (
                  <>
                    <Row label="Base Fare" value={formatINR(breakdown.base)} />
                    <Row label={`Distance Fare (${routeInfo!.distanceKm.toFixed(1)} km)`} value={formatINR(breakdown.distance)} />
                    <Row label={`Time Fare (${routeInfo!.durationMin} min)`} value={formatINR(breakdown.time)} />
                    <Row label="Taxes & Fees" value={formatINR(breakdown.taxes)} />
                  </>
                ) : tab === "rental" ? (
                  <Row label={RENTAL_PACKAGES.find((p) => p.id === pkgId)!.label} value={formatINR(estimatedFare)} />
                ) : null}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <div>
                  <div className="text-sm font-semibold text-primary">Total Fare (Est.)</div>
                  <div className="text-[11px] text-muted-foreground">Inclusive of all taxes</div>
                </div>
                <div className="text-xl font-extrabold text-primary">{formatINR(estimatedFare)}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-around rounded-2xl bg-primary-soft px-3 py-3 text-[12px] text-foreground/80">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> No surge pricing</span>
              <span className="h-4 w-px bg-border" />
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> Free cancellation</span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={() => setSummaryOpen(false)}
                className="rounded-xl border-2 border-primary py-3.5 text-sm font-bold text-primary"
              >
                Cancel
              </button>
              <button
                disabled={submitting}
                onClick={handleBook}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Book Now <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}
