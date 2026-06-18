import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadGoogleMaps } from "@/lib/maps/load-maps";
import { realisticCarTop } from "@/components/VehicleIcon";
import { Loader2, Car } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/drivers-map")({
  component: AdminDriversMap,
});

function AdminDriversMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("drivers")
      .select("id, name, phone, vehicle_type, vehicle_model, vehicle_number, current_lat, current_lng, is_online, status")
      .eq("status", "approved");
    setDrivers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-drivers-map")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bookings" }, () => load())
      .subscribe();
    const id = window.setInterval(load, 10000);
    return () => { supabase.removeChannel(ch); clearInterval(id); };
  }, []);

  // Init map
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled || !ref.current) return;
        mapRef.current = new g.maps.Map(ref.current, {
          center: { lat: 20.5937, lng: 78.9629 },
          zoom: 5,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Render markers for drivers with known positions
  useEffect(() => {
    (async () => {
      const g = await loadGoogleMaps().catch(() => null);
      if (!g || !mapRef.current) return;

      const seen = new Set<string>();
      const bounds = new g.maps.LatLngBounds();
      let any = false;

      for (const d of drivers) {
        if (!d.current_lat || !d.current_lng) continue;
        seen.add(d.id);
        const pos = { lat: Number(d.current_lat), lng: Number(d.current_lng) };
        bounds.extend(pos);
        any = true;
        const plate = (d.vehicle_number || "—").toString().toUpperCase();
        const icon: google.maps.Icon = {
          url: realisticCarTop,
          scaledSize: new g.maps.Size(64, 64),
          anchor: new g.maps.Point(32, 32),
        };
        const existing = markersRef.current.get(d.id);
        if (existing) {
          existing.setPosition(pos);
          existing.setIcon(icon);
          existing.setTitle(`${d.name} · ${d.vehicle_model ?? ""} ${plate}`);
        } else {
          const m = new g.maps.Marker({
            map: mapRef.current,
            position: pos,
            icon,
            title: `${d.name} · ${d.vehicle_model ?? ""} ${plate}`,
            optimized: false,
          });
          markersRef.current.set(d.id, m);
        }
      }
      // Remove stale markers
      for (const [id, m] of markersRef.current) {
        if (!seen.has(id)) { m.setMap(null); markersRef.current.delete(id); }
      }
      if (any) mapRef.current.fitBounds(bounds, 64);
    })();
  }, [drivers]);

  const withLoc = drivers.filter((d) => d.current_lat && d.current_lng);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold flex items-center gap-2"><Car className="h-4 w-4 text-primary" /> Live Drivers Map</h2>
        <span className="text-xs text-muted-foreground">
          {withLoc.length}/{drivers.length} approved drivers with live position
        </span>
      </div>
      <div className="relative w-full overflow-hidden rounded-2xl border border-border" style={{ height: 480 }}>
        <div ref={ref} className="absolute inset-0" />
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-muted/60">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {!loading && withLoc.length === 0 && (
          <div className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-card/95 px-4 py-2 text-xs text-muted-foreground shadow">
            No approved drivers are sharing live location yet.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {drivers.map((d) => (
          <div key={d.id} className="rounded-xl border border-border bg-card p-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="font-bold">{d.name}</div>
              <span className={d.is_online ? "text-emerald-600" : "text-muted-foreground"}>
                {d.is_online ? "🟢 Online" : "⚫ Offline"}
              </span>
            </div>
            <div className="text-muted-foreground">{d.vehicle_type} · {d.vehicle_model || "—"} · {d.vehicle_number || "—"}</div>
            <div className="text-[10px] text-muted-foreground">
              {d.current_lat && d.current_lng
                ? `Live: ${Number(d.current_lat).toFixed(4)}, ${Number(d.current_lng).toFixed(4)}`
                : "No live position yet"}
            </div>
          </div>
        ))}
        {drivers.length === 0 && <p className="text-sm text-muted-foreground">No approved drivers.</p>}
      </div>
    </div>
  );
}
