import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, Calendar, Car, Map as MapIcon, Clock, ArrowUpDown, ArrowRight, ShieldCheck, Loader2, Shield, Sparkles, Users, Briefcase, Check } from "lucide-react";
import { z } from "zod";
import { BrandHeader } from "@/components/Brand";
import { PlaceAutocomplete, type PlacePick } from "@/components/PlaceAutocomplete";
import sedanImg from "@/assets/sedan.png";
import suvImg from "@/assets/suv.png";

import {
  RENTAL_PACKAGES, calcLocalFare, calcOutstationFare, formatINR, modelFare,
  VEHICLE_MODELS, type TripType, type VehicleModel,
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
  const [modelId, setModelId] = useState<string>(VEHICLE_MODELS[0].id);
  const [customModel, setCustomModel] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date(Date.now() + 15 * 60_000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number; polyline: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedModel = VEHICLE_MODELS.find((m) => m.id === modelId) ?? VEHICLE_MODELS[0];

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

  const tierFare = useMemo(() => {
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

  const estimatedFare = modelFare(selectedModel, tierFare);

  function swap() {
    setPickup(drop);
    setDrop(pickup);
  }

  const canBook = (() => {
    if (!pickup || !drop) return false;
    if (selectedModel.custom && !customModel.trim()) return false;
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
        vehicle_type: selectedModel.tier,
        vehicle_model: selectedModel.custom ? customModel.trim() : selectedModel.label,
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
    <div className="flex flex-col gap-4 pb-40">
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
          autoDetect
        />
        <div className="my-4 h-px bg-border" />
        <PlaceAutocomplete
          label={tab === "outstation" ? "To (Drop Location)" : "Drop Location"}
          value={drop}
          onChange={setDrop}
          placeholder="Search drop"
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
                <div className="font-bold text-primary">
                  {formatINR(selectedModel.tier === "sedan" ? p.sedan : p.suv)}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Vehicle selection */}
      <div className="mx-4">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-semibold">Select Specific Vehicle</div>
          <div className="text-[11px] text-muted-foreground">Tap to change</div>
        </div>
        <div className="text-xs text-muted-foreground">Fare updates automatically per vehicle</div>

        {routeLoading && tab !== "rental" && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Calculating route & fare…
          </div>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {VEHICLE_MODELS.map((m) => {
            const selected = m.id === modelId;
            const fare = modelFare(m, tierFare);
            return (
              <button
                key={m.id}
                onClick={() => setModelId(m.id)}
                className={cn(
                  "relative flex flex-col items-start gap-1 rounded-2xl border-2 bg-card p-3 text-left transition",
                  selected ? "border-foreground" : "border-border hover:border-foreground/40"
                )}
              >
                {selected && (
                  <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background">
                    <Check className="h-3 w-3" />
                  </span>
                )}
                <div className="grid h-14 w-full place-items-center rounded-lg bg-background">
                  <img
                    src={m.tier === "sedan" ? sedanImg : suvImg}
                    alt={m.label}
                    className="h-14 w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="mt-1 text-sm font-bold leading-tight">{m.label}</div>
                <div className="flex w-full items-center justify-between text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />{m.seats}
                    <Briefcase className="ml-1 h-3 w-3" />{m.bags}
                  </span>
                  <span className="font-bold text-primary">{fare > 0 ? formatINR(fare) : "—"}</span>
                </div>
              </button>
            );
          })}
        </div>

        {selectedModel.custom && (
          <input
            value={customModel}
            onChange={(e) => setCustomModel(e.target.value)}
            placeholder="Enter vehicle model (e.g. BMW 5 Series)"
            className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-3 text-sm outline-none focus:border-primary"
          />
        )}
      </div>

      {tab === "outstation" && (
        <div className="mx-4 flex items-start gap-2 rounded-xl bg-primary-soft p-3 text-xs text-foreground/80">
          <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
          Toll, State Tax, Driver Allowance included in the fare
        </div>
      )}

      {/* Why Luxury Cabs */}
      <section className="mx-4 mt-2">
        <div className="text-sm font-semibold">Why Luxury Cabs</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { I: Shield, t: "100% Safe", s: "Verified drivers" },
            { I: Clock, t: "On Time", s: "Always punctual" },
            { I: Sparkles, t: "Premium", s: "Top vehicles" },
          ].map(({ I, t, s }) => (
            <div key={t} className="rounded-xl border border-border bg-card p-3 text-center">
              <I className="mx-auto h-5 w-5 text-primary" />
              <div className="mt-1 text-[13px] font-semibold">{t}</div>
              <div className="text-[10px] text-muted-foreground">{s}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA — only after fare ready */}
      {canBook && (
        <div className="fixed inset-x-0 bottom-[64px] z-20 mx-auto max-w-[480px] animate-in slide-in-from-bottom px-3 pb-2 pt-2">
          <div className="rounded-2xl bg-card p-3 shadow-2xl ring-1 ring-border">
            <div className="mb-2 flex items-center justify-between px-1">
              <div>
                <div className="text-[11px] text-muted-foreground">{tab === "rental" ? "Package Fare" : "Estimated Fare"}</div>
                <div className="text-xl font-bold text-foreground">{formatINR(estimatedFare)}</div>
              </div>
              <div className="text-right text-[11px] text-muted-foreground">
                <div className="font-semibold text-foreground">{selectedModel.custom ? (customModel || "Other") : selectedModel.label}</div>
                <div>Inclusive of all taxes</div>
              </div>
            </div>
            <button
              disabled={submitting}
              onClick={handleBook}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-4 text-base font-bold text-primary-foreground shadow-lg disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Book Now <ArrowRight className="h-5 w-5" /></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
