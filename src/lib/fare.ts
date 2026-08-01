import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  RENTAL_PACKAGES,
  OUTSTATION_VEHICLES,
  DEFAULT_OUTSTATION_CONFIG,
  type RatesMap,
  type TripType,
  type VehicleType,
  type RentalPackage,
  type OutstationVehicle,
  type OutstationConfig,
  type LocalSlab,
} from "@/lib/fare-core";

export * from "@/lib/fare-core";

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

/** Admin-editable local slab table (`local_drop_fares`). */
export function useLocalSlabs(): { slabs: LocalSlab[]; loading: boolean; reload: () => void } {
  const [slabs, setSlabs] = useState<LocalSlab[]>([]);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("local_drop_fares")
      .select("vehicle_type,max_km,base_fare,per_km,per_min,is_above")
      .then(({ data }) => {
        if (cancelled) return;
        setSlabs(
          (data ?? []).map((r: any) => ({
            vehicleType: r.vehicle_type,
            maxKm: Number(r.max_km),
            baseFare: Number(r.base_fare),
            perKm: Number(r.per_km),
            perMin: Number(r.per_min),
            isAbove: !!r.is_above,
          }))
        );
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [n]);
  return { slabs, loading, reload: () => setN((x) => x + 1) };
}

// ---------- Admin-editable rental packages ----------
export function useRentalPackages(): { packages: RentalPackage[]; loading: boolean; reload: () => void } {
  const [packages, setPackages] = useState<RentalPackage[]>(RENTAL_PACKAGES);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (supabase as any)
      .from("rental_packages")
      .select("code,label,hours,km,sedan_price,suv_price,sub,extra_per_hour,extra_per_km,active,sort_order")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }: any) => {
        if (cancelled) return;
        if (data?.length) {
          setPackages(data.map((r: any) => ({
            id: r.code, label: r.label, hours: r.hours, km: r.km,
            sedan: Number(r.sedan_price), suv: Number(r.suv_price),
            sub: r.sub ?? "", extraPerHour: Number(r.extra_per_hour), extraPerKm: Number(r.extra_per_km),
          })));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [n]);
  return { packages, loading, reload: () => setN((x) => x + 1) };
}

// ---------- Admin-editable outstation vehicles ----------
export function useOutstationVehicles(): { vehicles: OutstationVehicle[]; loading: boolean; reload: () => void } {
  const [vehicles, setVehicles] = useState<OutstationVehicle[]>(OUTSTATION_VEHICLES);
  const [loading, setLoading] = useState(true);
  const [n, setN] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (supabase as any)
      .from("outstation_vehicles")
      .select("code,label,tier,per_km,bata,seats,bags,active,sort_order")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }: any) => {
        if (cancelled) return;
        if (data?.length) {
          setVehicles(data.map((r: any) => ({
            id: r.code, label: r.label, tier: r.tier as VehicleType,
            perKm: Number(r.per_km), bata: Number(r.bata),
            seats: r.seats, bags: r.bags,
          })));
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [n]);
  return { vehicles, loading, reload: () => setN((x) => x + 1) };
}

// ---------- Admin-editable outstation config ----------
export function useOutstationConfig(): { config: OutstationConfig; loading: boolean } {
  const [config, setConfig] = useState<OutstationConfig>(DEFAULT_OUTSTATION_CONFIG);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (supabase as any)
      .from("outstation_config")
      .select("night_halt,min_km_per_day,tax_percent")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }: any) => {
        if (cancelled) return;
        if (data) {
          setConfig({
            nightHalt: Number(data.night_halt ?? DEFAULT_OUTSTATION_CONFIG.nightHalt),
            minKmPerDay: Number(data.min_km_per_day ?? DEFAULT_OUTSTATION_CONFIG.minKmPerDay),
            taxPercent: Number(data.tax_percent ?? DEFAULT_OUTSTATION_CONFIG.taxPercent),
          });
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);
  return { config, loading };
}
