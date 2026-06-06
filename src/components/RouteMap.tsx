import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/maps/load-maps";
import { decode } from "@googlemaps/polyline-codec";

interface Props {
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  polyline?: string | null;
  driver?: { lat: number; lng: number } | null;
  height?: number | string;
  interactive?: boolean;
}

export function RouteMap({ pickup, drop, polyline, driver, height = 260, interactive = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const g = await loadGoogleMaps();
      if (cancelled || !ref.current) return;
      const map = new g.maps.Map(ref.current, {
        center: pickup,
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] },
        ],
      });
      mapRef.current = map;

      new g.maps.Marker({
        position: pickup, map,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: "#1f6f3f", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2 },
      });
      new g.maps.Marker({
        position: drop, map,
        icon: { path: "M12 0C7 0 3 4 3 9c0 7 9 15 9 15s9-8 9-15c0-5-4-9-9-9z", fillColor: "#e23b3b", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1.5, scale: 1.4, anchor: new g.maps.Point(12, 24) },
      });

      const path = polyline ? decode(polyline).map(([lat, lng]) => ({ lat, lng })) : [pickup, drop];
      new g.maps.Polyline({
        path, map,
        strokeColor: "#1f6f3f", strokeOpacity: 0.9, strokeWeight: 5,
      });

      const bounds = new g.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 48);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.lat, pickup.lng, drop.lat, drop.lng, polyline]);

  // Driver marker
  useEffect(() => {
    (async () => {
      const g = await loadGoogleMaps();
      if (!mapRef.current || !driver) return;
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new g.maps.Marker({
          map: mapRef.current,
          position: driver,
          icon: {
            path: "M5 14 L7 7 C7.5 5.5 8.5 5 10 5 L14 5 C15.5 5 16.5 5.5 17 7 L19 14 L17 14 A2 2 0 1 1 13 14 L11 14 A2 2 0 1 1 7 14 Z",
            fillColor: "#0f3a22", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1.5, scale: 1.4,
            anchor: new g.maps.Point(12, 10), rotation: 0,
          },
        });
      } else {
        driverMarkerRef.current.setPosition(driver);
      }
    })();
  }, [driver?.lat, driver?.lng]);

  return <div ref={ref} className="w-full rounded-2xl overflow-hidden border border-border" style={{ height }} />;
}
