/**
 * Server-only booking helpers. Fare is ALWAYS computed here from the
 * admin-editable pricing tables — never trusted from the browser.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calcLocalFare,
  calcOutstationBreakdown,
  DEFAULT_OUTSTATION_CONFIG,
  OUTSTATION_VEHICLES,
  RENTAL_PACKAGES,
  type LocalSlab,
  type OutstationConfig,
  type OutstationVehicle,
  type RatesMap,
  type RentalPackage,
  type TripType,
  type VehicleType,
} from "@/lib/fare-core";

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  polyline: string;
  tollInr: number;
}

export async function computeRouteServer(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteResult> {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const mapsKey = process.env['GOOGLE_MAPS_API_KEY'];
  if (!lovableKey || !mapsKey) throw new Error("Missing Maps credentials");

  const res = await fetch(
    "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.travelAdvisory.tollInfo",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        extraComputations: ["TOLLS"],
        routeModifiers: { vehicleInfo: { emissionType: "GASOLINE" } },
      }),
    }
  );
  if (!res.ok) throw new Error(`Routes API ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    routes?: Array<{
      distanceMeters: number;
      duration: string;
      polyline: { encodedPolyline: string };
      travelAdvisory?: {
        tollInfo?: { estimatedPrice?: Array<{ currencyCode: string; units?: string; nanos?: number }> };
      };
    }>;
  };
  const route = json.routes?.[0];
  if (!route) throw new Error("No route found");
  const seconds = Number(route.duration.replace("s", ""));
  let tollInr = 0;
  for (const p of route.travelAdvisory?.tollInfo?.estimatedPrice ?? []) {
    const amt = Number(p.units ?? 0) + (p.nanos ?? 0) / 1e9;
    if (p.currencyCode === "USD") tollInr += amt * 83;
    else tollInr += amt;
  }
  return {
    distanceKm: route.distanceMeters / 1000,
    durationMin: Math.round(seconds / 60),
    polyline: route.polyline.encodedPolyline,
    tollInr: Math.round(tollInr),
  };
}

export interface Pricing {
  rates?: RatesMap;
  slabs: LocalSlab[];
  packages: RentalPackage[];
  outVehicles: OutstationVehicle[];
  outConfig: OutstationConfig;
}

export async function loadPricing(db: SupabaseClient<any, any, any>): Promise<Pricing> {
  const [fc, ldf, rp, ov, oc] = await Promise.all([
    db.from("fare_config").select("trip_type,vehicle_type,base_fare,per_km,per_min,minimum_fare,outstation_per_km"),
    db.from("local_drop_fares").select("vehicle_type,max_km,base_fare,per_km,per_min,is_above"),
    db.from("rental_packages").select("code,label,hours,km,sedan_price,suv_price,sub,extra_per_hour,extra_per_km").eq("active", true).order("sort_order"),
    db.from("outstation_vehicles").select("code,label,tier,per_km,bata,seats,bags").eq("active", true).order("sort_order"),
    db.from("outstation_config").select("night_halt,min_km_per_day,tax_percent").eq("id", 1).maybeSingle(),
  ]);

  let rates: RatesMap | undefined;
  if (fc.data?.length) {
    const m: RatesMap = { local: {}, outstation: {}, rental: {} };
    for (const row of fc.data as any[]) {
      const tt = row.trip_type as TripType;
      if (!m[tt]) (m as any)[tt] = {};
      m[tt][row.vehicle_type as VehicleType] = {
        base: Number(row.base_fare),
        perKm: Number(row.per_km),
        perMin: Number(row.per_min),
        min: Number(row.minimum_fare),
        outstationPerKm: Number(row.outstation_per_km),
      };
    }
    rates = m;
  }

  return {
    rates,
    slabs: ((ldf.data ?? []) as any[]).map((r) => ({
      vehicleType: r.vehicle_type,
      maxKm: Number(r.max_km),
      baseFare: Number(r.base_fare),
      perKm: Number(r.per_km),
      perMin: Number(r.per_min),
      isAbove: !!r.is_above,
    })),
    packages: ((rp.data ?? []) as any[]).length
      ? ((rp.data ?? []) as any[]).map((r) => ({
          id: r.code, label: r.label, hours: r.hours, km: r.km,
          sedan: Number(r.sedan_price), suv: Number(r.suv_price),
          sub: r.sub ?? "", extraPerHour: Number(r.extra_per_hour), extraPerKm: Number(r.extra_per_km),
        }))
      : RENTAL_PACKAGES,
    outVehicles: ((ov.data ?? []) as any[]).length
      ? ((ov.data ?? []) as any[]).map((r) => ({
          id: r.code, label: r.label, tier: r.tier as VehicleType,
          perKm: Number(r.per_km), bata: Number(r.bata), seats: r.seats, bags: r.bags,
        }))
      : OUTSTATION_VEHICLES,
    outConfig: oc.data
      ? {
          nightHalt: Number((oc.data as any).night_halt ?? DEFAULT_OUTSTATION_CONFIG.nightHalt),
          minKmPerDay: Number((oc.data as any).min_km_per_day ?? DEFAULT_OUTSTATION_CONFIG.minKmPerDay),
          taxPercent: Number((oc.data as any).tax_percent ?? DEFAULT_OUTSTATION_CONFIG.taxPercent),
        }
      : DEFAULT_OUTSTATION_CONFIG,
  };
}

export interface QuoteInput {
  tripType: TripType;
  vehicleType: VehicleType;
  vehicleModel?: string | null;
  packageCode?: string | null;
  outstationVehicleCode?: string | null;
  days?: number;
}

export interface Quote {
  fare: number;
  distanceKm: number;
  durationMin: number;
  tolls: number;
  polyline: string | null;
  vehicleType: VehicleType;
  vehicleModel: string | null;
  packageLabel: string | null;
}

/** Authoritative fare. `route` is null for rental (no drop point). */
export function quoteFare(input: QuoteInput, pricing: Pricing, route: RouteResult | null): Quote {
  if (input.tripType === "rental") {
    const pkg = pricing.packages.find((p) => p.id === input.packageCode) ?? pricing.packages[0]!;
    const fare = input.vehicleType === "suv" ? pkg.suv : pkg.sedan;
    return {
      fare: Math.round(fare),
      distanceKm: pkg.km,
      durationMin: pkg.hours * 60,
      tolls: 0,
      polyline: null,
      vehicleType: input.vehicleType,
      vehicleModel: input.vehicleModel ?? (input.vehicleType === "suv" ? "SUV" : "Sedan"),
      packageLabel: pkg.label,
    };
  }

  if (!route) throw new Error("Route required");

  if (input.tripType === "outstation") {
    const v =
      pricing.outVehicles.find((x) => x.id === input.outstationVehicleCode) ??
      pricing.outVehicles.find((x) => x.tier === input.vehicleType) ??
      pricing.outVehicles[0]!;
    const km = route.distanceKm * 2;
    const tolls = Math.round(route.tollInr * 2);
    const bd = calcOutstationBreakdown(v, {
      distanceKm: km,
      days: Math.max(1, input.days ?? 1),
      tollFare: tolls,
      config: pricing.outConfig,
    });
    return {
      fare: bd.total,
      distanceKm: Number(km.toFixed(2)),
      durationMin: Math.round(route.durationMin * 2),
      tolls,
      polyline: route.polyline,
      vehicleType: v.tier,
      vehicleModel: v.label,
      packageLabel: null,
    };
  }

  const tolls = Math.round(route.tollInr);
  const fare = calcLocalFare(input.vehicleType, route.distanceKm, route.durationMin, {
    rates: pricing.rates,
    slabs: pricing.slabs,
    tollInr: tolls,
  });
  return {
    fare,
    distanceKm: Number(route.distanceKm.toFixed(2)),
    durationMin: Math.round(route.durationMin),
    tolls,
    polyline: route.polyline,
    vehicleType: input.vehicleType,
    vehicleModel: input.vehicleModel ?? (input.vehicleType === "suv" ? "SUV" : "Sedan"),
    packageLabel: null,
  };
}
