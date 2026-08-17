import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar, Map as MapIcon, Clock, ArrowRight, ArrowLeft, ChevronRight,
  Loader2, X, Pencil, ShieldCheck, ShieldAlert, UserCheck, Headphones, IndianRupee,
  Users, Snowflake, Car,
} from "lucide-react";

import { z } from "zod";
import { PlaceAutocomplete, type PlacePick } from "@/components/PlaceAutocomplete";
import { VehicleCard } from "@/components/VehicleCard";
import { CrownCarLogo } from "@/components/Brand";
import { RouteMap } from "@/components/RouteMap";
import { Sheet, SheetContent } from "@/components/ui/sheet";

import {
  RENTAL_PACKAGES, calcLocalFare, formatINR, useFareRates,
  OUTSTATION_VEHICLES, calcOutstationBreakdown, diffDays,
  useRentalPackages, useOutstationVehicles, useLocalSlabs, useOutstationConfig,
  type OutstationVehicle,
  type TripType, type VehicleType,
} from "@/lib/fare";
import { formatDuration } from "@/lib/utils";
import { computeRoute } from "@/lib/maps/routes.functions";
import { pushRecentBooking, findActiveBookingId, isActiveBookingMinimized, clearMinimizedActiveBooking } from "@/lib/booking-store";
import { createBookingSecure } from "@/lib/booking.functions";
import { getProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import sedanImg from "@/assets/sedan.png";
import suvImg from "@/assets/suv.png";

const searchSchema = z.object({ tab: z.enum(["local", "outstation", "rental"]).optional() });

export const Route = createFileRoute("/_app/booking")({
  head: () => ({ meta: [{ title: "Book a Ride — Luxury Cabs" }] }),
  validateSearch: searchSchema,
  component: () => <BookingPage forcedTab={null} />,
});

interface BookingPageProps {
  forcedTab: TripType | null;
}

export function BookingPage({ forcedTab }: BookingPageProps) {
  const navigate = useNavigate();
  const { rates } = useFareRates();
  const { slabs } = useLocalSlabs();
  const { config: outConfig } = useOutstationConfig();
  const { packages: dbPackages } = useRentalPackages();
  const { vehicles: dbOutVehicles } = useOutstationVehicles();
  // Use DB-loaded lists everywhere so admin edits apply live.
  const RENTAL_PKGS = dbPackages.length ? dbPackages : RENTAL_PACKAGES;
  const OUT_VEHICLES = dbOutVehicles.length ? dbOutVehicles : OUTSTATION_VEHICLES;
  const [tab, setTab] = useState<TripType>(forcedTab ?? "local");
  useEffect(() => { if (forcedTab) setTab(forcedTab); }, [forcedTab]);

  const [pickup, setPickup] = useState<PlacePick | null>(null);
  const [drop, setDrop] = useState<PlacePick | null>(null);
  const [pkgId, setPkgId] = useState<string>(RENTAL_PKGS[0].id);
  const [vehicle, setVehicle] = useState<VehicleType>("sedan");
  const [localModel, setLocalModel] = useState<"sedan" | "ciaz" | "suv" | "ertiga" | "innova" | "crysta">("sedan");
  const [outVehicleId, setOutVehicleId] = useState<string>(OUT_VEHICLES[0].id);
  // Empty on first render (server + client match); filled after hydration.
  const [scheduledAt, setScheduledAt] = useState<string>("");
  useEffect(() => {
    if (scheduledAt) return;
    const d = new Date(Date.now() + 15 * 60_000);
    d.setSeconds(0, 0);
    const off = d.getTimezoneOffset();
    setScheduledAt(new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16));
  }, [scheduledAt]);
  const [returnAt, setReturnAt] = useState<string>("");
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number; polyline: string; tollInr: number } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [showAllVehicles, setShowAllVehicles] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [tripTypePopupOpen, setTripTypePopupOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Measure the floating map overlays so the route always fits between them.
  const topCardRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [mapInsets, setMapInsets] = useState({ top: 120, bottom: 300 });

  // Bounce to active trip
  useEffect(() => {
    let cancelled = false;
    findActiveBookingId().then((activeId) => {
      if (!cancelled && activeId && !isActiveBookingMinimized(activeId)) {
        navigate({ to: "/track/$id", params: { id: activeId }, replace: true });
      }
    });
    return () => { cancelled = true; };
  }, [navigate]);

  // Compute route whenever both endpoints set (and not rental)
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
    () => OUT_VEHICLES.find((v) => v.id === outVehicleId) ?? OUT_VEHICLES[0],
    [outVehicleId]
  );
  const outDays = useMemo(() => (returnAt ? diffDays(scheduledAt, returnAt) : 1), [scheduledAt, returnAt]);
  const outBreakdown = useMemo(() => {
    if (tab !== "outstation" || !routeInfo) return null;
    const km = routeInfo.distanceKm * 2;
    return calcOutstationBreakdown(outVehicle, { distanceKm: km, days: outDays, tollFare: routeInfo.tollInr * 2, config: outConfig });
  }, [tab, routeInfo, outVehicle, outDays, outConfig]);

  const localFares = useMemo(() => {
    if (tab !== "local" || !routeInfo) return { sedan: 0, suv: 0 };
    const opts = { rates, slabs, tollInr: routeInfo.tollInr };
    return {
      sedan: calcLocalFare("sedan", routeInfo.distanceKm, routeInfo.durationMin, opts),
      suv: calcLocalFare("suv", routeInfo.distanceKm, routeInfo.durationMin, opts),
    };
  }, [tab, routeInfo, rates, slabs]);
  const rentalFares = useMemo(() => {
    if (tab !== "rental") return { sedan: 0, suv: 0 };
    const pkg = RENTAL_PKGS.find((p) => p.id === pkgId)!;
    return { sedan: pkg.sedan, suv: pkg.suv };
  }, [tab, pkgId]);
  const estimatedFare = useMemo(() => {
    if (tab === "outstation") return outBreakdown?.total ?? 0;
    if (tab === "rental") return vehicle === "sedan" ? rentalFares.sedan : rentalFares.suv;
    return vehicle === "sedan" ? localFares.sedan : localFares.suv;
  }, [tab, outBreakdown, rentalFares, localFares, vehicle]);

  const canPickVehicle = (() => {
    if (tab === "rental") return !!pickup;
    if (!pickup || !drop) return false;
    if (tab === "outstation" && !returnAt) return false;
    return !!routeInfo && !routeLoading;
  })();

  function chooseLocalRental(v: VehicleType, model: "sedan" | "ciaz" | "suv" | "ertiga" | "innova" | "crysta" = v as any) {
    setVehicle(v); setLocalModel(model); setVehicleSheetOpen(false);
  }
  function chooseOutstation(id: string) { setOutVehicleId(id); setVehicleSheetOpen(false); }

  function switchTab(next: TripType) {
    if (next === tab) return;
    setTab(next);
    if (next === "rental") setDrop(null);
  }


  async function handleBook() {
    if (submitting) return;
    if (tab !== "rental" && (!pickup || !drop || !routeInfo)) return;
    if (tab === "rental" && !pickup) return;
    setSubmitting(true);
    try {
      const LOCAL_LABELS: Record<string, string> = {
        sedan: "Sedan", ciaz: "Ciaz", suv: "SUV", ertiga: "Ertiga", innova: "Innova", crysta: "Innova Crysta",
      };
      const profile = getProfile();
      const { data: authData } = await supabase.auth.getUser();

      // Fare, distance, duration and tolls are computed on the server from the
      // admin pricing tables — the browser only sends the trip choices.
      const booking = await createBookingSecure({
        data: {
          tripType: tab,
          vehicleType: tab === "outstation" ? outVehicle.tier : vehicle,
          vehicleModel: tab === "outstation" ? outVehicle.label : (LOCAL_LABELS[localModel] ?? (vehicle === "sedan" ? "Sedan" : "SUV")),
          packageCode: tab === "rental" ? pkgId : null,
          outstationVehicleCode: tab === "outstation" ? outVehicle.id : null,
          days: tab === "outstation" ? outDays : 1,
          pickup: { address: pickup!.address, lat: pickup!.lat, lng: pickup!.lng },
          drop: tab === "rental" || !drop ? null : { address: drop.address, lat: drop.lat, lng: drop.lng },
          scheduledAt: new Date(scheduledAt).toISOString(),
          customerName: profile?.name ?? authData.user?.user_metadata?.name ?? null,
          customerPhone: profile?.phone ?? authData.user?.phone ?? null,
        },
      });
      pushRecentBooking(booking.id);
      clearMinimizedActiveBooking();
      navigate({ to: "/track/$id", params: { id: booking.id } });
    } catch (e) {
      console.error(e);
      alert("Could not create booking. Please try again.");
    } finally { setSubmitting(false); }
  }


  const tariffLabel =
    tab === "outstation" ? outVehicle.label
      : ({ sedan: "Sedan", ciaz: "Ciaz", suv: "SUV", ertiga: "Ertiga", innova: "Innova", crysta: "Innova Crysta" } as const)[localModel];
  const carImg = (tab === "outstation" ? outVehicle.tier : vehicle) === "sedan" ? sedanImg : suvImg;

  // FULL-SCREEN MAP STAGE: when local/outstation have both endpoints set.
  const mapStage = tab !== "rental" && !!pickup && !!drop;

  // Keep map fit padding in sync with the overlay card + bottom sheet heights.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const measure = () => {
      const top = topCardRef.current?.offsetHeight ?? 0;
      const bottom = sheetRef.current?.offsetHeight ?? 0;
      setMapInsets((prev) =>
        prev.top === top + 16 && prev.bottom === bottom + 16 ? prev : { top: top + 16, bottom: bottom + 16 }
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (topCardRef.current) ro.observe(topCardRef.current);
    if (sheetRef.current) ro.observe(sheetRef.current);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [mapStage, routeInfo, tab, vehicleSheetOpen, summaryOpen]);

  // Hide app chrome on the map stage
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (mapStage) root.classList.add("chrome-hidden");
    else root.classList.remove("chrome-hidden");
    return () => { root.classList.remove("chrome-hidden"); };
  }, [mapStage]);

  // ===== MAP STAGE =====
  if (mapStage) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-background">
        {/* Top address card */}
        <div ref={topCardRef} className="absolute left-3 right-3 top-3 z-20 rounded-2xl border border-border bg-card p-3 shadow-lg"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <div className="flex items-start gap-2">
            <button
              onClick={() => { setDrop(null); }}
              className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-muted"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1 truncate text-xs font-medium">{pickup!.address}</div>
              </div>
              <div className="my-1 ml-1.5 h-3 w-px border-l border-dashed border-muted-foreground/40" />
              <div className="flex items-start gap-2">
                <span className="mt-1.5 h-2.5 w-2.5 rounded-sm border-2 border-rose-600 shrink-0" />
                <div className="min-w-0 flex-1 truncate text-xs font-medium">{drop!.address}</div>
                <button
                  onClick={() => setDrop(null)}
                  className="shrink-0 rounded-md border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  Edit
                </button>
              </div>
            </div>
          </div>
          {routeInfo && (
            <div className="mt-2 flex items-center justify-center gap-3 border-t border-border pt-2 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{routeInfo.distanceKm.toFixed(1)} km</span>
              <span>·</span>
              <span>{formatDuration(routeInfo.durationMin)}</span>
            </div>
          )}
        </div>

        {/* Map */}
        <div className="absolute inset-0">
          <RouteMap
            pickup={{ lat: pickup!.lat, lng: pickup!.lng }}
            drop={{ lat: drop!.lat, lng: drop!.lng }}
            polyline={routeInfo?.polyline ?? null}
            height="100%"
            showMyLocation
            fitPadding={{ top: mapInsets.top, bottom: mapInsets.bottom }}
            fitKey={`${pickup!.lat},${pickup!.lng}-${drop!.lat},${drop!.lng}-${mapInsets.top}-${mapInsets.bottom}`}
          />
        </div>

        {/* Bottom sheet — vehicles + CTA */}
        <div
          ref={sheetRef}
          className="absolute inset-x-0 bottom-0 z-20 rounded-t-3xl border-t border-border bg-card p-4 shadow-2xl"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted-foreground/30" />
          {tab === "outstation" && !returnAt && (
            <div className="mb-3 rounded-xl border border-primary/40 bg-primary-soft p-3">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-primary">Return Date & Time (required)</label>
              <input
                type="datetime-local"
                value={returnAt}
                min={scheduledAt}
                onChange={(e) => setReturnAt(e.target.value)}
                className="mt-1 w-full rounded-lg bg-background px-2 py-1.5 text-sm outline-none"
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Select Vehicle</h3>
            <button
              onClick={() => { if (canPickVehicle) { setShowAllVehicles(false); setVehicleSheetOpen(true); } }}
              disabled={!canPickVehicle}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary disabled:opacity-50"
            >
              Change vehicle <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {tab === "outstation" ? (
              OUT_VEHICLES.filter((v) => v.id === "sedan" || v.id === "ertiga").map((v) => {
                const km = (routeInfo?.distanceKm ?? 0) * 2;
                const bd = routeInfo && canPickVehicle
                  ? calcOutstationBreakdown(v, { distanceKm: km, days: outDays, tollFare: (routeInfo.tollInr ?? 0) * 2, config: outConfig })
                  : null;
                return (
                  <InlineVehicleRow
                    key={v.id}
                    img={v.tier === "sedan" ? sedanImg : suvImg}
                    label={v.label} seats={v.seats}
                    fare={bd?.total ?? 0}
                    selected={outVehicleId === v.id}
                    onSelect={() => chooseOutstation(v.id)}
                  />
                );
              })
            ) : (
              <>
                <InlineVehicleRow img={sedanImg} label="Sedan" seats={4}
                  fare={localFares.sedan}
                  selected={vehicle === "sedan" && localModel === "sedan"}
                  onSelect={() => chooseLocalRental("sedan", "sedan")} />
                <InlineVehicleRow img={suvImg} label="SUV" seats={7}
                  fare={localFares.suv}
                  selected={vehicle === "suv" && localModel === "suv"}
                  onSelect={() => chooseLocalRental("suv", "suv")} />
              </>
            )}
          </div>
          <button
            type="button"
            disabled={!canPickVehicle}
            onClick={() => setSummaryOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg disabled:opacity-50"
          >
            {routeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Review and Book · {formatINR(estimatedFare)} <ArrowRight className="h-4 w-4" /></>}
          </button>
        </div>

        {renderVehicleSheet()}
        {renderSummarySheet()}
      </div>
    );
  }

  // ===== HOME (Local) / RENTAL / OUTSTATION entry =====
  return (
    <div className="flex flex-col gap-3 pb-40">
      <div data-app-chrome className="sticky top-0 z-30 flex h-14 items-center justify-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur">
        <CrownCarLogo className="h-6 w-6 text-green-600" />
        <div className="font-display text-lg font-bold tracking-tight text-primary">Luxury Cabs</div>
      </div>

      {/* Trip type chips — at TOP of home */}
      <div className="mx-4 grid grid-cols-3 gap-2">
        {([
          { id: "local", label: "Local", I: Car },
          { id: "rental", label: "Rental", I: Clock },
          { id: "outstation", label: "Outstation", I: MapIcon },
        ] as const).map(({ id, label, I }) => (
          <button
            key={id}
            onClick={() => switchTab(id)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-full border-2 px-2 py-2 text-xs font-semibold transition",
              tab === id ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-muted-foreground"
            )}
          >
            <I className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Pickup / Drop inputs (drop hidden for rental) */}
      <div className="mx-4 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex flex-col items-center pt-1">
            <span className="h-3 w-3 rounded-full border-2 border-emerald-600" />
            {tab !== "rental" && <>
              <span className="my-1 h-6 w-px border-l border-dashed border-muted-foreground/50" />
              <span className="h-3 w-3 rounded-sm border-2 border-rose-600" />
            </>}
          </div>
          <div className="min-w-0 flex-1 divide-y divide-border">
            <div className={tab === "rental" ? "" : "pb-2"}>
              <PlaceAutocomplete
                label="Pickup"
                value={pickup}
                onChange={setPickup}
                placeholder="Enter pickup location"
                accent="green"
                autoDetect
              />
            </div>
            {tab !== "rental" && (
              <div className="pt-2">
                <PlaceAutocomplete
                  label="Drop"
                  value={drop}
                  onChange={setDrop}
                  placeholder="Enter drop location"
                  accent="red"
                />
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Rental: packages + vehicle inline */}
      {tab === "rental" && (
        <>
          <div className="mx-4">
            <div className="text-sm font-semibold">Choose a Package</div>
            <div className="mt-2 space-y-2">
              {RENTAL_PKGS.map((p) => (
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
                  <div className="text-right">
                    <div className="font-bold text-foreground">
                      {formatINR(vehicle === "sedan" ? p.sedan : p.suv)}
                    </div>
                    <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {vehicle === "suv" ? "SUV" : "Sedan"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="mx-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Select Vehicle</h3>
              <button onClick={() => { if (canPickVehicle) { setShowAllVehicles(false); setVehicleSheetOpen(true); } }}
                className="inline-flex items-center gap-0.5 text-sm font-semibold text-primary disabled:opacity-50"
                disabled={!canPickVehicle}>
                Change vehicle <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 space-y-2">
              <InlineVehicleRow img={sedanImg} label="Sedan" seats={4} fare={rentalFares.sedan}
                selected={vehicle === "sedan" && localModel === "sedan"}
                onSelect={() => chooseLocalRental("sedan", "sedan")} />
              <InlineVehicleRow img={suvImg} label="SUV" seats={7} fare={rentalFares.suv}
                selected={vehicle === "suv" && localModel === "suv"}
                onSelect={() => chooseLocalRental("suv", "suv")} />
            </div>
          </div>
        </>
      )}

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

      {renderVehicleSheet()}
      {renderSummarySheet()}

      {/* Floating Review and Book — only for rental (local/outstation get it on map stage) */}
      {tab === "rental" && canPickVehicle && !summaryOpen && !vehicleSheetOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={() => setSummaryOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg">
            Review and Book · {formatINR(estimatedFare)} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );

  // ---- helper renderers ----
  function renderVehicleSheet() {
    return (
      <Sheet open={vehicleSheetOpen} onOpenChange={setVehicleSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-0 p-0 max-h-[85vh] overflow-y-auto">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-muted-foreground/30 mt-3" />
          <div className="px-5 pb-6 pt-4">
            <h2 className="text-center text-lg font-bold">Select Vehicle</h2>
            <div className="mt-4 space-y-2">
              {tab === "outstation" ? (
                OUT_VEHICLES.map((v) => {
                  const km = (routeInfo?.distanceKm ?? 0) * 2;
                  const bd = routeInfo
                    ? calcOutstationBreakdown(v, { distanceKm: km, days: outDays, tollFare: (routeInfo.tollInr ?? 0) * 2, config: outConfig })
                    : null;
                  return (
                    <button key={v.id} onClick={() => chooseOutstation(v.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card p-3 text-left hover:border-primary">
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
                  <VehicleCard type="suv" fare={tab === "rental" ? rentalFares.suv : localFares.suv} selected={vehicle === "suv" && localModel === "suv"} onSelect={() => chooseLocalRental("suv", "suv")} />
                  {!showAllVehicles && (
                    <button type="button" onClick={() => setShowAllVehicles(true)}
                      className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 py-2.5 text-xs font-semibold text-primary">
                      Change vehicle · Show all vehicles <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {showAllVehicles && (
                    <>
                      <button type="button" onClick={() => chooseLocalRental("sedan", "ciaz")}
                        className={cn("flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left",
                          localModel === "ciaz" ? "border-foreground" : "border-border")}>
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
                      {(["ertiga", "innova", "crysta"] as const).map((m) => {
                        const labels = { ertiga: "Ertiga", innova: "Innova", crysta: "Innova Crysta" } as const;
                        const subs = { ertiga: "6 Seats · AC", innova: "7 Seats · AC", crysta: "Premium 7 Seats · AC" } as const;
                        return (
                          <button key={m} type="button" onClick={() => chooseLocalRental("suv", m)}
                            className={cn("flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left",
                              localModel === m ? "border-foreground" : "border-border")}>
                            <div className="grid h-20 w-28 shrink-0 place-items-center rounded-xl bg-white">
                              <img src={suvImg} alt={labels[m]} className="h-full w-full object-contain scale-x-[-1]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="text-base font-bold text-foreground">{labels[m]}</span>
                                <span className="text-sm font-bold text-foreground">{formatINR(tab === "rental" ? rentalFares.suv : localFares.suv)}</span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">{subs[m]}</div>
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  function renderSummarySheet() {
    return (
      <Sheet open={summaryOpen} onOpenChange={setSummaryOpen}>
        <SheetContent side="bottom" className="rounded-none border-0 p-0 h-[100dvh] max-h-[100dvh] w-full overflow-y-auto bg-background">
          <div className="sticky top-0 z-10 flex items-center gap-3 bg-background border-b border-border px-4 py-4"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
            <button type="button" onClick={() => setSummaryOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-background/60" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h2 className="flex-1 text-xl font-bold">Trip Summary</h2>
            <button type="button" onClick={() => setSummaryOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 pt-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 7rem)" }}>
            {/* Trip type — click to change */}
            <button
              type="button"
              onClick={() => setTripTypePopupOpen((v) => !v)}
              className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/15"
            >
              {tab === "local" && <><Car className="h-3.5 w-3.5" /> Change Trip · Local</>}
              {tab === "rental" && <><Clock className="h-3.5 w-3.5" /> Change Trip · Rental · {RENTAL_PKGS.find(p => p.id === pkgId)?.label}</>}
              {tab === "outstation" && <><MapIcon className="h-3.5 w-3.5" /> Change Trip · Outstation · {outDays} day{outDays > 1 ? "s" : ""}</>}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            {tripTypePopupOpen && (
              <div className="mb-3 rounded-2xl border border-border bg-card p-2 shadow-lg">
                {([
                  { id: "local", label: "Local", I: Car },
                  { id: "rental", label: "Rental", I: Clock },
                  { id: "outstation", label: "Outstation", I: MapIcon },
                ] as const).map(({ id, label, I }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setTripTypePopupOpen(false); setSummaryOpen(false); switchTab(id); }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                      tab === id ? "bg-primary-soft text-primary" : "text-foreground hover:bg-muted"
                    )}
                  >
                    <I className="h-4 w-4" /> {label}
                    {tab === id && <span className="ml-auto text-[10px] uppercase tracking-wide">Current</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Route card */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex">
                <div className="mr-3 flex flex-col items-center pt-1">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-primary" />
                  {tab !== "rental" && <>
                    <span className="my-1 h-10 w-px border-l-2 border-dashed border-muted-foreground/40" />
                    <MapIcon className="h-4 w-4 text-rose-500" />
                  </>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 text-sm font-medium">{pickup?.address}</div>
                    <button type="button" onClick={() => { setSummaryOpen(false); setPickup(null); }}
                      className="shrink-0 rounded-lg border border-primary/40 px-3 py-1 text-xs font-semibold text-primary">
                      Edit
                    </button>
                  </div>
                  {tab !== "rental" && (
                    <div className="mt-6 flex items-start justify-between gap-2">
                      <div className="min-w-0 text-sm font-medium">{drop?.address}</div>
                      <button type="button" onClick={() => { setSummaryOpen(false); setDrop(null); }}
                        className="shrink-0 rounded-lg border border-primary/40 px-3 py-1 text-xs font-semibold text-primary">
                        Edit
                      </button>
                    </div>
                  )}
                  {routeInfo && tab !== "rental" && (
                    <div className="mt-2 text-right text-xs text-muted-foreground">
                      <span className="font-bold text-foreground">
                        {(tab === "outstation" ? routeInfo.distanceKm * 2 : routeInfo.distanceKm).toFixed(1)} km
                      </span>
                      <span className="mx-1">·</span>
                      <span>{formatDuration(tab === "outstation" ? routeInfo.durationMin * 2 : routeInfo.durationMin)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Rental package — edit inline */}
            {tab === "rental" && (
              <div className="mt-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">Rental Package</div>
                    <div className="text-sm font-bold">{RENTAL_PKGS.find(p => p.id === pkgId)?.label}</div>
                  </div>
                  <button type="button" onClick={() => setSummaryOpen(false)}
                    className="rounded-lg border border-primary/40 px-3 py-1 text-xs font-semibold text-primary">
                    Change
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Additional hours and additional km will be charged.
                </div>
              </div>
            )}

            {/* Selected vehicle + fare */}
            <div className="relative mt-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <img src={carImg} alt={tariffLabel} className="h-14 w-20 object-contain scale-x-[-1]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">Selected Vehicle</div>
                  <div className="text-base font-bold">{tariffLabel}</div>
                  <button type="button" onClick={() => { setShowAllVehicles(false); setSummaryOpen(false); setVehicleSheetOpen(true); }}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-primary underline-offset-2 hover:underline">
                    <Pencil className="h-3 w-3" /> Change vehicle
                  </button>
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold text-primary">{formatINR(estimatedFare)}</div>
                </div>
              </div>


              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <div>
                  <div className="text-sm font-semibold text-primary">Estimated Fare</div>
                  <div className="text-[11px] text-muted-foreground">Inclusive of all taxes</div>
                </div>
                <div className="text-xl font-extrabold text-primary">{formatINR(estimatedFare)}</div>
              </div>
              <div className="mt-2 rounded-lg bg-primary-soft/60 px-2 py-1.5 text-[10px] text-foreground/70">
                Final bill is calculated from driver's live GPS km &amp; time at trip end.
              </div>
            </div>

            {/* Date & Time editor (lives in summary now) */}
            <div className="mt-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold">{tab === "outstation" ? "Pickup Date & Time" : "Date & Time"}</div>
              </div>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none"
              />
              {tab === "outstation" && (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <div className="text-sm font-semibold">Return Date &amp; Time</div>
                  </div>
                  <input
                    type="datetime-local"
                    value={returnAt}
                    min={scheduledAt}
                    onChange={(e) => setReturnAt(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm text-foreground outline-none"
                  />
                </>
              )}
            </div>

            <div className="mt-3 flex items-center justify-around rounded-2xl bg-primary-soft px-3 py-3 text-[12px] text-foreground/80">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> No surge pricing</span>
              <span className="h-4 w-px bg-border" />
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" /> Free cancellation</span>
            </div>

            <div className="mt-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              Choose your payment method (Cash / UPI / Card) after the driver reaches the drop location.
            </div>


            <div className="mt-4 grid grid-cols-2 gap-3">
              <button onClick={() => setSummaryOpen(false)} className="rounded-xl border-2 border-primary py-3.5 text-sm font-bold text-primary">
                Cancel
              </button>
              <button disabled={submitting} onClick={() => handleBook()}
                className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground disabled:opacity-50">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Confirm Booking <ArrowRight className="h-4 w-4" /></>}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    );
  }
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
        "flex w-full items-center gap-3 rounded-2xl border-2 bg-card p-3 text-left transition disabled:opacity-50",
        selected ? "border-primary" : "border-border hover:border-primary/40"
      )}
    >
      <div className="grid h-14 w-20 shrink-0 place-items-center">
        <img src={img} alt={label} className="h-full w-full object-contain scale-x-[-1]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold">{label}</div>
        <div className="mt-0.5 inline-flex items-center gap-2 text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" /> {seats}
          <Snowflake className="h-3 w-3" /> AC
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-extrabold text-primary">{fare ? formatINR(fare) : "—"}</div>
      </div>
    </button>
  );
}



