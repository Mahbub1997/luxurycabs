/**
 * Pure fare math. NO react, NO supabase imports — safe to use on the server.
 * All tunable numbers can be supplied from the admin-editable DB tables;
 * the hardcoded values are only fallbacks when a table row is missing.
 */

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

export const META: Record<VehicleType, Pick<VehicleMeta, "label" | "seats" | "bags">> = {
  sedan: { label: "Sedan", seats: 4, bags: 2 },
  suv: { label: "SUV", seats: 7, bags: 4 },
};

export const DEFAULT_RATE: Record<VehicleType, Rate> = {
  sedan: { base: 60, perKm: 30, perMin: 1, min: 150, outstationPerKm: 12 },
  suv: { base: 78, perKm: 39, perMin: 1.3, min: 195, outstationPerKm: 16 },
};

/** trip_type -> vehicle_type -> rate */
export type RatesMap = Record<TripType, Partial<Record<VehicleType, Rate>>>;

/** A row of the admin-editable `local_drop_fares` slab table. */
export interface LocalSlab {
  vehicleType: string;
  maxKm: number;
  baseFare: number;
  perKm: number;
  perMin: number;
  isAbove: boolean;
}

export const SUV_MULTIPLIER = 1.3;
export const DEFAULT_TAX_PERCENT = 5;

export type RentalPackage = {
  id: string;
  label: string;
  hours: number;
  km: number;
  sedan: number;
  suv: number;
  sub: string;
  extraPerHour: number;
  extraPerKm: number;
};

export const RENTAL_PACKAGES: RentalPackage[] = [
  { id: "4h40", label: "4 Hours / 40 KM", hours: 4, km: 40, sedan: 999, suv: 1499, sub: "Best for short trips", extraPerHour: 150, extraPerKm: 12 },
  { id: "8h80", label: "8 Hours / 80 KM", hours: 8, km: 80, sedan: 1899, suv: 2799, sub: "Ideal for half-day trips", extraPerHour: 180, extraPerKm: 14 },
  { id: "12h120", label: "12 Hours / 120 KM", hours: 12, km: 120, sedan: 2799, suv: 3999, sub: "Best for full-day trips", extraPerHour: 200, extraPerKm: 16 },
];

export function rateFor(v: VehicleType, trip: TripType, rates?: RatesMap): Rate {
  const r = rates?.[trip]?.[v];
  if (!r) return DEFAULT_RATE[v];
  const d = DEFAULT_RATE[v];
  // A zero in the admin table means "not configured" — never price a trip at 0.
  return {
    base: r.base > 0 ? r.base : d.base,
    perKm: r.perKm > 0 ? r.perKm : d.perKm,
    perMin: r.perMin > 0 ? r.perMin : d.perMin,
    min: r.min > 0 ? r.min : d.min,
    outstationPerKm: r.outstationPerKm > 0 ? r.outstationPerKm : d.outstationPerKm,
  };
}

export function tariffFor(v: VehicleType): VehicleMeta {
  return { ...META[v], ...DEFAULT_RATE[v] };
}

export interface LocalFareOptions {
  rates?: RatesMap;
  slabs?: LocalSlab[];
  tollInr?: number;
  taxPercent?: number;
}

interface ResolvedLocalRate {
  base: number;
  perKmIn: number;
  perKmOut: number;
  threshold: number;
  perMin: number;
  min: number;
  multiplier: number;
}

/**
 * Resolve the effective local slab for a distance.
 * Priority: `local_drop_fares` rows -> `fare_config` row -> hardcoded default.
 * SUV falls back to sedan slabs x1.3 when no SUV rows exist.
 */
function resolveLocalRate(v: VehicleType, distanceKm: number, opts?: LocalFareOptions): ResolvedLocalRate {
  const all = opts?.slabs ?? [];
  let multiplier = 1;
  let rows = all.filter((s) => s.vehicleType === v);
  if (!rows.length && v === "suv") {
    rows = all.filter((s) => s.vehicleType === "sedan");
    multiplier = SUV_MULTIPLIER;
  }

  if (rows.length) {
    const tiers = rows.filter((r) => !r.isAbove).sort((a, b) => a.maxKm - b.maxKm);
    const aboveRows = rows.filter((r) => r.isAbove).sort((a, b) => b.maxKm - a.maxKm);
    const above = aboveRows[0];
    const pool = tiers.length ? tiers : rows.slice().sort((a, b) => a.maxKm - b.maxKm);
    const tier = pool.find((r) => distanceKm <= r.maxKm) ?? pool[pool.length - 1]!;
    const threshold = above ? above.maxKm : tier.maxKm;
    return {
      base: tier.baseFare,
      perKmIn: tier.perKm,
      perKmOut: above ? above.perKm : tier.perKm,
      threshold,
      perMin: tier.perMin,
      min: DEFAULT_RATE[v].min,
      multiplier,
    };
  }

  const r = rateFor(v, "local", opts?.rates);
  return {
    base: r.base,
    perKmIn: r.perKm,
    perKmOut: r.perKm,
    threshold: Number.POSITIVE_INFINITY,
    perMin: r.perMin,
    min: r.min,
    multiplier: 1,
  };
}

export interface LocalBreakdown {
  base: number;
  distance: number;
  time: number;
  tolls: number;
  taxes: number;
  total: number;
}

/** Single source of truth for local pricing — quote and invoice both use this. */
export function fareBreakdown(
  v: VehicleType,
  distanceKm: number,
  durationMin: number,
  opts?: LocalFareOptions
): LocalBreakdown {
  const r = resolveLocalRate(v, distanceKm, opts);
  const inKm = Math.min(distanceKm, r.threshold);
  const outKm = Math.max(0, distanceKm - r.threshold);
  const base = Math.round(r.base * r.multiplier);
  const distance = Math.round((r.perKmIn * inKm + r.perKmOut * outKm) * r.multiplier);
  const time = Math.round(r.perMin * durationMin * r.multiplier);
  const tolls = Math.round(opts?.tollInr ?? 0);
  const taxPercent = opts?.taxPercent ?? DEFAULT_TAX_PERCENT;
  const taxes = Math.round(((base + distance + time + tolls) * taxPercent) / 100);
  const raw = base + distance + time + tolls + taxes;
  const total = Math.max(Math.round(raw / 10) * 10, Math.round(r.min * r.multiplier));
  return { base, distance, time, tolls, taxes, total };
}

export function calcLocalFare(v: VehicleType, distanceKm: number, durationMin: number, opts?: LocalFareOptions) {
  return fareBreakdown(v, distanceKm, durationMin, opts).total;
}

// ---------- Outstation ----------

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

export interface OutstationConfig {
  nightHalt: number;
  minKmPerDay: number;
  taxPercent: number;
}

export const DEFAULT_OUTSTATION_CONFIG: OutstationConfig = {
  nightHalt: OUTSTATION_NIGHT_HALT,
  minKmPerDay: OUTSTATION_MIN_KM_PER_DAY,
  taxPercent: DEFAULT_TAX_PERCENT,
};

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
  opts: { distanceKm: number; days: number; tollFare?: number; config?: OutstationConfig }
): OutstationBreakdown {
  const cfg = opts.config ?? DEFAULT_OUTSTATION_CONFIG;
  const days = Math.max(1, opts.days || 1);
  const actualKm = opts.distanceKm;
  const chargedKm = Math.max(actualKm, cfg.minKmPerDay * days);
  const distance = Math.round(v.perKm * chargedKm);
  const driverBata = v.bata * days;
  const nightHalts = Math.max(0, days - 1);
  const nightHalt = nightHalts * cfg.nightHalt;
  const tolls = Math.round(opts.tollFare ?? 0);
  const subtotal = distance + driverBata + nightHalt + tolls;
  const taxes = Math.round((subtotal * cfg.taxPercent) / 100);
  const total = Math.round((subtotal + taxes) / 10) * 10;
  return { perKm: v.perKm, chargedKm, actualKm, days, nightHalts, distance, driverBata, nightHalt, tolls, taxes, total };
}

export function calcOutstationFare(
  v: VehicleType,
  distanceKm: number,
  opts?: { vehicles?: OutstationVehicle[]; days?: number; tollFare?: number; config?: OutstationConfig }
) {
  const list = opts?.vehicles?.length ? opts.vehicles : OUTSTATION_VEHICLES;
  const ov = list.find((x) => x.tier === v) ?? list[0]!;
  return calcOutstationBreakdown(ov, {
    distanceKm,
    days: opts?.days ?? 1,
    tollFare: opts?.tollFare,
    config: opts?.config,
  }).total;
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
