import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type VehicleType = "sedan" | "suv";
export type TripType = "local" | "outstation" | "rental";

export interface Rate {
  base: number;
  perKm: number;
  perMin: number;
  min: number;
  outstationPerKm: number;
}

export interface VehicleMeta extends Rate {
  label: string;
  seats: number;
  bags: number;
}

const META: Record<VehicleType, Pick<VehicleMeta, "label" | "seats" | "bags">> = {
  sedan: { label: "Sedan", seats: 4, bags: 2 },
  suv: { label: "SUV", seats: 7, bags: 4 },
};

const DEFAULT_RATE: Record<VehicleType, Rate> = {
  sedan: { base: 60, perKm: 14, perMin: 1.5, min: 150, outstationPerKm: 12 },
  suv: { base: 90, perKm: 19, perMin: 2.0, min: 220, outstationPerKm: 16 },
};

/** trip_type -> vehicle_type -> rate */
export type RatesMap = Record<TripType, Partial<Record<VehicleType, Rate>>>;

export const RENTAL_PACKAGES = [
  { id: "4h40", label: "4 Hours / 40 KM", hours: 4, km: 40, sedan: 999, suv: 1499, sub: "Best for short trips" },
  { id: "8h80", label: "8 Hours / 80 KM", hours: 8, km: 80, sedan: 1899, suv: 2799, sub: "Ideal for half-day trips" },
  { id: "12h120", label: "12 Hours / 120 KM", hours: 12, km: 120, sedan: 2799, suv: 3999, sub: "Best for full-day trips" },
] as const;

function rateFor(v: VehicleType, trip: TripType, rates?: RatesMap): Rate {
  return rates?.[trip]?.[v] ?? DEFAULT_RATE[v];
}

export function tariffFor(v: VehicleType): VehicleMeta {
  return { ...META[v], ...DEFAULT_RATE[v] };
}

export function calcLocalFare(v: VehicleType, distanceKm: number, durationMin: number, _rates?: RatesMap) {
  // Slab logic: base ₹60 covers up to 20km @ ₹30/km + ₹1/min.
  // Above 20km: ₹24/km for excess distance (no extra base).
  // SUV is +30% over sedan.
  const base = 60;
  const perKmIn = 30;
  const perKmOut = 24;
  const perMin = 1;
  const inKm = Math.min(distanceKm, 20);
  const outKm = Math.max(0, distanceKm - 20);
  let total = base + perKmIn * inKm + perKmOut * outKm + perMin * durationMin;
  if (v === "suv") total = total * 1.3;
  return Math.max(Math.round(total / 10) * 10, 150);
}

export function calcOutstationFare(v: VehicleType, distanceKm: number, _rates?: RatesMap) {
  const ov = v === "sedan" ? OUTSTATION_VEHICLES[0] : OUTSTATION_VEHICLES[1];
  return calcOutstationBreakdown(ov, { distanceKm, days: 1 }).total;
}

// ---------- Outstation (new spec) ----------

export interface OutstationVehicle {
  id: string;
  label: string;
  perKm: number;
  bata: number; // driver bata per day
  seats: number;
  bags: number;
  tier: VehicleType;
}

export const OUTSTATION_VEHICLES: OutstationVehicle[] = [
  { id: "sedan",  label: "Sedan",         perKm: 12, bata: 400, seats: 4, bags: 2, tier: "sedan" },
  { id: "ciaz",   label: "Ciaz",          perKm: 13, bata: 400, seats: 4, bags: 2, tier: "sedan" },
  { id: "ertiga", label: "SUV Ertiga",    perKm: 17, bata: 500, seats: 6, bags: 3, tier: "suv"   },
  { id: "innova", label: "SUV Innova",    perKm: 19, bata: 500, seats: 7, bags: 4, tier: "suv"   },
  { id: "crysta", label: "Innova Crysta", perKm: 21, bata: 500, seats: 7, bags: 4, tier: "suv"   },
];

export const OUTSTATION_NIGHT_HALT = 500;
export const OUTSTATION_MIN_KM_PER_DAY = 300;

function parseLocalDate(s: string): Date | null {
  if (!s) return null;
  // "YYYY-MM-DD" — parse as local midnight to avoid UTC offset bugs
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
export function diffDays(pickupISO: string, returnISO: string): number {
  const a = parseLocalDate(pickupISO);
  const b = parseLocalDate(returnISO);
  if (!a || !b) return 1;
  const diff = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff + 1);
}

export interface OutstationBreakdown {
  perKm: number;
  chargedKm: number;
  actualKm: number;
  days: number;
  nightHalts: number;
  distance: number;
  driverBata: number;
  nightHalt: number;
  tolls: number;
  taxes: number;
  total: number;
}

export function calcOutstationBreakdown(
  v: OutstationVehicle,
  opts: { distanceKm: number; days: number; tollFare?: number }
): OutstationBreakdown {
  const days = Math.max(1, opts.days || 1);
  const actualKm = opts.distanceKm;
  const chargedKm = Math.max(actualKm, OUTSTATION_MIN_KM_PER_DAY * days);
  const distance = Math.round(v.perKm * chargedKm);
  const driverBata = v.bata * days;
  const nightHalts = Math.max(0, days - 1);
  const nightHalt = nightHalts * OUTSTATION_NIGHT_HALT;
  const tolls = Math.round(opts.tollFare ?? 0);
  const subtotal = distance + driverBata + nightHalt + tolls;
  const taxes = Math.round(subtotal * 0.05);
  const total = Math.round((subtotal + taxes) / 10) * 10;
  return { perKm: v.perKm, chargedKm, actualKm, days, nightHalts, distance, driverBata, nightHalt, tolls, taxes, total };
}

export const formatINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

// ---------- Vehicle models ----------

export interface VehicleModel {
  id: string;
  label: string;
  tier: VehicleType;
  mult: number;
  seats: number;
  bags: number;
  custom?: boolean;
}

export const VEHICLE_MODELS: VehicleModel[] = [
  { id: "dzire", label: "Swift Dzire", tier: "sedan", mult: 1.0, seats: 4, bags: 2 },
  { id: "ciaz", label: "Ciaz", tier: "sedan", mult: 1.0, seats: 4, bags: 2 },
  { id: "etios", label: "Etios", tier: "sedan", mult: 1.0, seats: 4, bags: 2 },
  { id: "ertiga", label: "Ertiga", tier: "suv", mult: 1.0, seats: 6, bags: 3 },
  { id: "innova", label: "Innova", tier: "suv", mult: 1.1, seats: 7, bags: 4 },
  { id: "crysta", label: "Innova Crysta", tier: "suv", mult: 1.25, seats: 7, bags: 4 },
];

export function modelFare(model: VehicleModel, tierFare: { sedan: number; suv: number }) {
  const base = tierFare[model.tier];
  if (!base) return 0;
  return Math.max(Math.round((base * model.mult) / 10) * 10, base);
}

// ---------- DB-driven rates ----------

export function useFareRates(): { rates: RatesMap | undefined; loading: boolean; reload: () => void } {
  const [rates, setRates] = useState<RatesMap | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .from("fare_config")
      .select("trip_type,vehicle_type,base_fare,per_km,per_min,minimum_fare,outstation_per_km")
      .then(({ data }) => {
        if (cancelled) return;
        if (data && data.length) {
          const m: RatesMap = { local: {}, outstation: {}, rental: {} };
          for (const row of data) {
            const tt = row.trip_type as TripType;
            const vt = row.vehicle_type as VehicleType;
            if (!m[tt]) (m as any)[tt] = {};
            m[tt][vt] = {
              base: Number(row.base_fare),
              perKm: Number(row.per_km),
              perMin: Number(row.per_min),
              min: Number(row.minimum_fare),
              outstationPerKm: Number(row.outstation_per_km),
            };
          }
          setRates(m);
        } else {
          setRates(undefined);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [n]);
  return { rates, loading, reload: () => setN((x) => x + 1) };
}

export function fareBreakdown(v: VehicleType, distanceKm: number, durationMin: number, rates?: RatesMap) {
  const r = rateFor(v, "local", rates);
  const base = r.base;
  const distance = Math.round(r.perKm * distanceKm);
  const time = Math.round(r.perMin * durationMin);
  const taxes = Math.round((base + distance + time) * 0.05);
  const total = base + distance + time + taxes;
  return { base, distance, time, taxes, total };
}
