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

export function calcLocalFare(v: VehicleType, distanceKm: number, durationMin: number, rates?: RatesMap) {
  const r = rateFor(v, "local", rates);
  const raw = r.base + r.perKm * distanceKm + r.perMin * durationMin;
  return Math.max(Math.round(raw / 10) * 10, r.min);
}

export function calcOutstationFare(v: VehicleType, distanceKm: number, rates?: RatesMap) {
  const r = rateFor(v, "outstation", rates);
  const raw = r.base * 4 + r.outstationPerKm * distanceKm + 350;
  return Math.max(Math.round(raw / 10) * 10, 1500);
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
