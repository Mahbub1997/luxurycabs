export type VehicleType = "sedan" | "suv";
export type TripType = "local" | "outstation" | "rental";

const TARIFF = {
  sedan: { base: 60, perKm: 14, perMin: 1.5, min: 150, outstationPerKm: 12, label: "Sedan", seats: 4, bags: 2 },
  suv:   { base: 90, perKm: 19, perMin: 2.0, min: 220, outstationPerKm: 16, label: "SUV",   seats: 7, bags: 4 },
} as const;

export const RENTAL_PACKAGES = [
  { id: "4h40", label: "4 Hours / 40 KM", hours: 4, km: 40, sedan: 999,  suv: 1499, sub: "Best for short trips" },
  { id: "8h80", label: "8 Hours / 80 KM", hours: 8, km: 80, sedan: 1899, suv: 2799, sub: "Ideal for half-day trips" },
  { id: "12h120", label: "12 Hours / 120 KM", hours: 12, km: 120, sedan: 2799, suv: 3999, sub: "Best for full-day trips" },
] as const;

export function tariffFor(v: VehicleType) { return TARIFF[v]; }

export function calcLocalFare(v: VehicleType, distanceKm: number, durationMin: number) {
  const t = TARIFF[v];
  const raw = t.base + t.perKm * distanceKm + t.perMin * durationMin;
  return Math.max(Math.round(raw / 10) * 10, t.min);
}

export function calcOutstationFare(v: VehicleType, distanceKm: number) {
  const t = TARIFF[v];
  // round-trip estimate handled by caller (multiply km by 2). Includes driver allowance.
  const raw = t.base * 4 + t.outstationPerKm * distanceKm + 350; // tolls/allowance
  return Math.max(Math.round(raw / 10) * 10, 1500);
}

export function fareBreakdown(v: VehicleType, distanceKm: number, durationMin: number) {
  const t = TARIFF[v];
  const base = t.base;
  const distance = Math.round(t.perKm * distanceKm);
  const time = Math.round(t.perMin * durationMin);
  const taxes = Math.round((base + distance + time) * 0.05);
  const total = base + distance + time + taxes;
  return { base, distance, time, taxes, total };
}

export const formatINR = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN");
