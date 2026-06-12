import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Calendar, Car, Map as MapIcon, Clock, ArrowRight, ChevronRight,
  Loader2, X, Pencil, ShieldCheck, ShieldAlert, UserCheck, Headphones, IndianRupee,
  Users, Snowflake, Crosshair,
} from "lucide-react";
import { z } from "zod";
import { PlaceAutocomplete, type PlacePick } from "@/components/PlaceAutocomplete";
import { VehicleCard } from "@/components/VehicleCard";
import { RouteMap } from "@/components/RouteMap";
import { CrownCarLogo } from "@/components/Brand";
import { Sheet, SheetContent } from "@/components/ui/sheet";

import {
  RENTAL_PACKAGES, calcLocalFare, formatINR, useFareRates,
  OUTSTATION_VEHICLES, calcOutstationBreakdown, diffDays,
  type OutstationVehicle,
  type TripType, type VehicleType,
} from "@/lib/fare";
import { formatDuration } from "@/lib/utils";
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
  const [pkgId, setPkgId] = useState<string>(RENTAL_PACKAGES[0].id);
  const [vehicle, setVehicle] = useState<VehicleType>("sedan");
  const [localModel, setLocalModel] = useState<"sedan" | "ciaz" | "suv">("sedan");
  const [outVehicleId, setOutVehicleId] = useState<string>(OUTSTATION_VEHICLES[0].id);
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date(Date.now() + 15 * 60_000);
    d.setSeconds(0, 0);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
  });
  const [returnAt, setReturnAt] = useState<string>("");
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number; polyline: string; tollInr: number } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [farePopupOpen, setFarePopupOpen] = useState(false);
  const [farePopupShownFor, setFarePopupShownFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  

  // Note: routeInfo is overwritten by the route-fetch effect below; don't
  // null it here or the map polyline flickers off/on between picks.

  useEffect(() => {
    if (!pickup || !drop || tab === "rental") return;
    let cancelled = false;
    setRouteLoading(true);
    computeRoute({ data: { origin: { lat: pickup.lat, lng: pickup.lng }, destination: { lat: drop.lat, lng: drop.lng } } })
      .then((r) => { if (!cancelled) setRouteInfo(r as any); })
      .catch((e) => console.error(e))
      .finally(() => { if (!cancelled) setRouteLoading(false); });
    return () => { cancelled = true; };
  }, [pickup, drop, tab]);

  const outVehicle = useMemo<OutstationVehicle>(
    () => OUTSTATION_VEHICLES.find((v) => v.id === outVehicleId) ?? OUTSTATION_VEHICLES[0],
    [outVehicleId]
  );

  const outDays = useMemo(() => (returnAt ? diffDays(scheduledAt, returnAt) : 1), [scheduledAt, returnAt]);

  const outBreakdown = useMemo(() => {
    if (tab !== "outstation" || !routeInfo) return null;
    const km = routeInfo.distanceKm * 2; // round trip only
    return calcOutstationBreakdown(outVehicle, { distanceKm: km, days: outDays, tollFare: routeInfo.tollInr * 2 });
  }, [tab, routeInfo, outVehicle, outDays]);

  // Inline vehicle rows are shown below the map; no auto-open sheet needed.

  const localFares = useMemo(() => {
    if (tab !== "local" || !routeInfo) return { sedan: 0, suv: 0 };
    return {
      sedan: calcLocalFare("sedan", routeInfo.distanceKm, routeInfo.durationMin, rates),
      suv: calcLocalFare("suv", routeInfo.distanceKm, routeInfo.durationMin, rates),
    };
  }, [tab, routeInfo, rates]);

  const rentalFares = useMemo(() => {
    if (tab !== "rental") return { sedan: 0, suv: 0 };
    const pkg = RENTAL_PACKAGES.find((p) => p.id === pkgId)!;
    return { sedan: pkg.sedan, suv: pkg.suv };
  }, [tab, pkgId]);

  const estimatedFare = useMemo(() => {
    if (tab === "outstation") return outBreakdown?.total ?? 0;
    if (tab === "rental") return vehicle === "sedan" ? rentalFares.sedan : rentalFares.suv;
    return vehicle === "sedan" ? localFares.sedan : localFares.suv;
  }, [tab, outBreakdown, rentalFares, localFares, vehicle]);

  function swap() { setPickup(drop); setDrop(pickup); }

  const canPickVehicle = (() => {
    if (!pickup || !drop) return tab === "rental";
    if (tab === "rental") return true;
    if (tab === "outstation" && !returnAt) return false;
    return !!routeInfo && !routeLoading;
  })();

  // Auto-open fare popup when route is ready (Local / Outstation).
  const routeKey = pickup && drop && routeInfo ? `${pickup.lat},${pickup.lng}-${drop.lat},${drop.lng}-${tab}` : null;
  useEffect(() => {
    if (tab === "rental") return;
    if (canPickVehicle && routeKey && farePopupShownFor !== routeKey && !summaryOpen) {
      setFarePopupOpen(true);
      setFarePopupShownFor(routeKey);
    }
  }, [canPickVehicle, routeKey, tab, farePopupShownFor, summaryOpen]);


  function openVehicleSheet() {
    if (!canPickVehicle) return;
    setSummaryOpen(false);
    setVehicleSheetOpen(true);
  }
  function openSummary() {
    if (!canPickVehicle) return;
    setVehicleSheetOpen(false);
    setSummaryOpen(true);
  }

  function chooseLocalRental(v: VehicleType, model: "sedan" | "ciaz" | "suv" = v as any) {
    setVehicle(v);
    setLocalModel(model);
    setVehicleSheetOpen(false);
  }
  function chooseOutstation(id: string) {
    setOutVehicleId(id);
    setVehicleSheetOpen(false);
  }

  async function handleBook() {
    if (submitting) return;
    if (tab !== "rental" && (!pickup || !drop || !routeInfo)) return;
    if (tab === "rental" && (!pickup || !drop)) return;
    setSubmitting(true);
    try {
      const pkg = RENTAL_PACKAGES.find((p) => p.id === pkgId);
      let distance: number;
      let duration: number;
      let vehicleType: VehicleType = vehicle;
      let vehicleModel: string = localModel === "ciaz" ? "Ciaz" : vehicle === "sedan" ? "Sedan" : "SUV";

      if (tab === "rental") {
        distance = pkg!.km;
        duration = pkg!.hours * 60;
      } else if (tab === "outstation") {
        distance = routeInfo!.distanceKm * 2;
        duration = routeInfo!.durationMin * 2;
        vehicleType = outVehicle.tier;
        vehicleModel = outVehicle.label;
      } else {
        distance = routeInfo!.distanceKm;
        duration = routeInfo!.durationMin;
      }

      const booking = await createBooking({
        trip_type: tab,
        trip_mode: tab === "outstation" ? "round" : null,
        package_label: tab === "rental" ? pkg!.label : null,
        pickup_address: pickup!.address,
        pickup_lat: pickup!.lat,
        pickup_lng: pickup!.lng,
        drop_address: drop!.address,
        drop_lat: drop!.lat,
        drop_lng: drop!.lng,
        scheduled_at: new Date(scheduledAt).toISOString(),
        vehicle_type: vehicleType,
        vehicle_model: vehicleModel,
        distance_km: Number(distance.toFixed(2)),
        duration_min: Math.round(duration),
        fare: estimatedFare,
        route_polyline: tab === "rental" ? null : routeInfo!.polyline,
      });
      pushRecentBooking(booking.id);
      navigate({ to: "/track/$id", params: { id: booking.id } });
    } catch (e) {
      console.error(e);
      alert("Could not create booking. Please try again.");
    } finally { setSubmitting(false); }
  }

  const tariffLabel =
    tab === "outstation"
      ? outVehicle.label
      : localModel === "ciaz"
        ? "Ciaz"
        : vehicle === "sedan"
          ? "Sedan"
          : "SUV";
  const carImg = (tab === "outstation" ? outVehicle.tier : vehicle) === "sedan" ? sedanImg : suvImg;

  // Hide app header + bottom nav once both pickup & drop are selected so the
  // vehicle picker fits on-screen without scrolling.
  const hideChrome = !!(pickup && drop);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (hideChrome) root.classList.add("chrome-hidden");
    else root.classList.remove("chrome-hidden");
    return () => { root.classList.remove("chrome-hidden"); };
  }, [hideChrome]);

  return (
    <div className="flex flex-col gap-3 pb-40">
      {/* Header with crown */}
      {!hideChrome && (
        <div data-app-chrome className="sticky top-0 z-30 flex h-14 items-center justify-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
          <CrownCarLogo className="h-6 w-6 text-green-600" />
          <div className="font-display text-lg font-bold tracking-tight text-primary">Luxury Cabs</div>
        </div>
      )}

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

      {/* Pickup + Drop search cards (tap to open full-screen search) */}
      <div className="mx-4 space-y-2">
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm">
          <div className="min-w-0 flex-1">
            <PlaceAutocomplete
              label="Pickup Location"
              value={pickup}
              onChange={setPickup}
              placeholder="Search pickup"
              autoDetect
            />
          </div>
          <Crosshair className="h-4 w-4 shrink-0 text-primary" />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm">
          <div className="min-w-0 flex-1">
            <PlaceAutocomplete
              label="Drop Location"
              value={drop}
              onChange={setDrop}
              placeholder="Where to go?"
              accent="green"
            />
          </div>
        </div>
      </div>

      {/* Map — compact so vehicle cards stay above the fold */}
      {pickup && drop && tab !== "rental" && (
        <div className="mx-4 overflow-hidden rounded-2xl border border-border">
          <RouteMap
            pickup={{ lat: pickup.lat, lng: pickup.lng }}
            drop={{ lat: drop.lat, lng: drop.lng }}
            polyline={routeInfo?.polyline ?? null}
            height={160}
          />
        </div>
      )}


      {/* Pickup date & time */}
      <div className="mx-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-3">
        <Calendar className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{tab === "outstation" ? "Pickup Date & Time" : "Date & Time"}</span>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="ml-auto bg-transparent text-sm text-foreground outline-none"
        />
      </div>

      {/* Outstation return date & time — same box style, shown after pickup */}
      {tab === "outstation" && (
        <>
          <div className={cn(
            "mx-4 flex items-center gap-2 rounded-xl border bg-card px-3 py-3",
            returnAt ? "border-border" : "border-primary"
          )}>
            <Calendar className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Return Date & Time</span>
            <input
              type="datetime-local"
              required
              value={returnAt}
              min={scheduledAt}
              onChange={(e) => setReturnAt(e.target.value)}
              className="ml-auto bg-transparent text-sm text-foreground outline-none"
            />
          </div>
          <div className="mx-4 flex items-center gap-2 text-xs">
            <MapIcon className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-primary">Round Trip</span>
            <span className="ml-auto rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
              {returnAt ? `${outDays} day${outDays > 1 ? "s" : ""}` : "Select return"}
            </span>
          </div>
          {!returnAt && (
            <div className="mx-4 -mt-1 text-[11px] font-medium text-primary">
              Return date & time is required for outstation trips.
            </div>
          )}
        </>
      )}

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

      {routeLoading && tab !== "rental" && (
        <div className="mx-4 flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculating route & fare…
        </div>
      )}

      {/* Select Vehicle — always visible directly under the map */}
      <div className="mx-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold">Select Vehicle</h3>
          <button
            onClick={() => canPickVehicle && setVehicleSheetOpen(true)}
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary disabled:opacity-50"
            disabled={!canPickVehicle}
          >
            View All <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {tab === "outstation" ? (
            OUTSTATION_VEHICLES.filter((v) => v.id === "sedan" || v.id === "ertiga").map((v) => {
              const km = (routeInfo?.distanceKm ?? 0) * 2;
              const bd = routeInfo && canPickVehicle
                ? calcOutstationBreakdown(v, { distanceKm: km, days: outDays, tollFare: (routeInfo.tollInr ?? 0) * 2 })
                : null;
              return (
                <InlineVehicleRow
                  key={v.id}
                  img={v.tier === "sedan" ? sedanImg : suvImg}
                  label={v.label}
                  seats={v.seats}
                  fare={bd?.total ?? 0}
                  selected={outVehicleId === v.id}
                  disabled={false}
                  onSelect={() => chooseOutstation(v.id)}
                />
              );
            })
          ) : (
            <>
              <InlineVehicleRow
                img={sedanImg}
                label="Sedan"
                seats={4}
                fare={tab === "rental" ? rentalFares.sedan : localFares.sedan}
                selected={vehicle === "sedan" && localModel === "sedan"}
                disabled={false}
                onSelect={() => chooseLocalRental("sedan", "sedan")}
              />
              <InlineVehicleRow
                img={suvImg}
                label="SUV"
                seats={7}
                fare={tab === "rental" ? rentalFares.suv : localFares.suv}
                selected={vehicle === "suv"}
                disabled={false}
                onSelect={() => chooseLocalRental("suv", "suv")}
              />
            </>
          )}
        </div>

        {canPickVehicle && (
          <div className="mt-3 rounded-2xl border border-primary/25 bg-primary-soft p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Step 3 of 4</div>
                <div className="mt-1 text-sm font-semibold">Review your trip summary and confirm booking.</div>
              </div>
              <button
                type="button"
                onClick={openSummary}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
              >
                Book Now <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>


      {/* Trust strip */}
      <div className="mx-4 mt-2 grid grid-cols-4 gap-2 border-t border-border pt-4 text-center">
        {[
          { I: ShieldAlert, t: "Safety Secure", s: "Your safety is our priority" },
          { I: UserCheck, t: "Verified Driver", s: "Experienced & background checked" },
          { I: Headphones, t: "Help & Support", s: "24/7 assistance whenever you need" },
          { I: IndianRupee, t: "Transparent Fare", s: "No hidden charges, ever" },
        ].map(({ I, t, s }) => (
          <div key={t} className="flex flex-col items-center gap-1 px-1">
            <I className="h-5 w-5 text-primary" />
            <div className="text-[10px] font-bold leading-tight">{t}</div>
            <div className="text-[9px] leading-tight text-muted-foreground">{s}</div>
          </div>
        ))}
      </div>


      {/* Fare popup — auto-opens after route is calculated */}
      <Sheet open={farePopupOpen} onOpenChange={setFarePopupOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-0 p-0">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30 mt-3" />
          <div className="px-5 pb-6 pt-4">
            <h2 className="text-center text-lg font-bold">Your Ride is Ready</h2>
            <p className="mt-1 text-center text-xs text-muted-foreground">Selected vehicle and fare estimate</p>

            <div className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary-soft/30 p-3">
              <img src={carImg} alt={tariffLabel} className="h-16 w-24 object-contain scale-x-[-1]" />
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold">{tariffLabel}</div>
                <div className="text-[11px] text-muted-foreground">Best for {tab === "outstation" ? outVehicle.seats : vehicle === "sedan" ? 4 : 7} People · AC</div>
                <button
                  type="button"
                  onClick={() => { setFarePopupOpen(false); setVehicleSheetOpen(true); }}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
                >
                  <Pencil className="h-3 w-3" /> Change vehicle
                </button>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">Total Fare</div>
                <div className="text-xl font-extrabold text-primary">{formatINR(estimatedFare)}</div>
              </div>
            </div>

            <button
              onClick={() => { setFarePopupOpen(false); setSummaryOpen(true); }}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground"
            >
              Book Now <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Vehicle picker Sheet */}
      <Sheet open={vehicleSheetOpen} onOpenChange={setVehicleSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-0 p-0 max-h-[85vh] overflow-y-auto">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30 mt-3" />
          <div className="px-5 pb-6 pt-4">
            <h2 className="text-center text-lg font-bold">Select Vehicle</h2>
            <div className="mt-4 space-y-2">
              {tab === "outstation" ? (
                OUTSTATION_VEHICLES.map((v) => {
                  const km = (routeInfo?.distanceKm ?? 0) * 2;
                  const bd = routeInfo
                    ? calcOutstationBreakdown(v, { distanceKm: km, days: outDays, tollFare: (routeInfo.tollInr ?? 0) * 2 })
                    : null;
                  return (
                    <button
                      key={v.id}
                      onClick={() => chooseOutstation(v.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card p-3 text-left hover:border-primary"
                    >
                      <div className="grid h-16 w-24 shrink-0 place-items-center">
                        <img src={v.tier === "sedan" ? sedanImg : suvImg} alt={v.label} className="h-full w-full object-contain scale-x-[-1]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold">{v.label}</div>
                        <div className="mt-0.5 inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Users className="h-3 w-3" /> {v.seats}
                          <Snowflake className="h-3 w-3" /> AC
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-extrabold text-primary">{bd ? formatINR(bd.total) : "—"}</div>
                        <div className="text-[10px] text-muted-foreground">Total fare</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <>
                  <VehicleCard type="sedan" fare={tab === "rental" ? rentalFares.sedan : localFares.sedan} selected={vehicle === "sedan" && localModel === "sedan"} onSelect={() => chooseLocalRental("sedan", "sedan")} />
                  <button
                    type="button"
                    onClick={() => chooseLocalRental("sedan", "ciaz")}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left",
                      localModel === "ciaz" ? "border-foreground" : "border-border"
                    )}
                  >
                    <div className="grid h-20 w-28 shrink-0 place-items-center rounded-xl bg-white">
                      <img src={sedanImg} alt="Ciaz" className="h-full w-full object-contain scale-x-[-1]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-base font-bold text-foreground">Ciaz</span>
                        <span className="text-sm font-bold text-foreground">{formatINR(tab === "rental" ? rentalFares.sedan : localFares.sedan)}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">Premium sedan · 4 Seats · AC</div>
                    </div>
                  </button>
                  <VehicleCard type="suv" fare={tab === "rental" ? rentalFares.suv : localFares.suv} selected={vehicle === "suv"} onSelect={() => chooseLocalRental("suv", "suv")} />
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Trip Summary Sheet — full screen */}
      <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent side="bottom" className="rounded-none border-0 p-0 h-[100dvh] max-h-[100dvh] w-full overflow-y-auto">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30 mt-3" />

          <div className="px-5 pb-6 pt-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
            <h2 className="text-center text-xl font-bold">Trip Summary</h2>


            {/* Route */}
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
                      {tab === "outstation" ? "Round" : tab === "rental" ? "Rental" : "Local"}
                    </div>
                  </div>
                  <div className="mt-5 flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm font-medium truncate">{drop?.address}</div>
                    {routeInfo && (
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        <div className="font-bold text-foreground">
                          {(tab === "outstation" ? routeInfo.distanceKm * 2 : routeInfo.distanceKm).toFixed(1)} km
                        </div>
                        <div>{formatDuration(tab === "outstation" ? routeInfo.durationMin * 2 : routeInfo.durationMin)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Selected vehicle + fare */}
            <div className="relative mt-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <img src={carImg} alt={tariffLabel} className="h-14 w-20 object-contain scale-x-[-1]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">Selected Vehicle</div>
                  <div className="text-base font-bold">{tariffLabel}</div>
                  {tab === "outstation" && (
                    <div className="text-[11px] text-muted-foreground">
                      {outDays} day{outDays > 1 ? "s" : ""}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={openVehicleSheet}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    <Pencil className="h-3 w-3" /> Change vehicle
                  </button>
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold text-primary">{formatINR(estimatedFare)}</div>
                </div>
              </div>


              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <div>
                  <div className="text-sm font-semibold text-primary">Total Fare</div>
                  <div className="text-[11px] text-muted-foreground">Inclusive of all taxes</div>
                </div>
                <div className="text-xl font-extrabold text-primary">{formatINR(estimatedFare)}</div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Date & Time</div>
                  <div className="text-[11px] text-muted-foreground">Adjust your schedule before confirming.</div>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                  <Pencil className="h-3 w-3" /> Change
                </span>
              </div>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none"
              />
              {tab === "outstation" && (
                <input
                  type="date"
                  value={returnAt}
                  min={scheduledAt.slice(0, 10)}
                  onChange={(e) => setReturnAt(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none"
                />
              )}
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
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Confirm Booking <ArrowRight className="h-4 w-4" /></>}
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

function InlineVehicleRow({
  img, label, seats, fare, onSelect, disabled, selected,
}: { img: string; label: string; seats: number; fare: number; onSelect: () => void; disabled?: boolean; selected?: boolean }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border-2 bg-card p-3 text-left transition disabled:opacity-60",
        selected ? "border-primary bg-primary-soft/40" : "border-border hover:border-primary"
      )}
    >
      <div className="grid h-16 w-24 shrink-0 place-items-center rounded-xl bg-white">
        <img src={img} alt={label} className="h-full w-full object-contain scale-x-[-1]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold">{label}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {seats} Seats</span>
          <span className="inline-flex items-center gap-1"><Snowflake className="h-3 w-3" /> AC</span>
        </div>
        <div className="mt-0.5 text-[11px] text-primary">Best for {seats} People</div>
      </div>
      <div className="text-right">
        <div className="text-base font-extrabold text-primary">{fare > 0 ? formatINR(fare) : "—"}</div>
        <div className="text-[10px] text-muted-foreground">Estimated Fare</div>
      </div>
      <span className={cn(
        "ml-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 bg-card",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
      )}>
        {selected ? <span className="h-2 w-2 rounded-full bg-primary-foreground" /> : null}
      </span>
    </button>
  );
}
