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
  fitKey?: number;
}

export function RouteMap({ pickup, drop, polyline, driver, height = 260, interactive = false, fitKey = 0 }: Props) {
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
  }, [pickup.lat, pickup.lng, drop.lat, drop.lng, polyline, fitKey]);

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
            // Top-down car silhouette (windshield + hood + wheels)
            path: "M -6 -12 C -6 -14 -4 -15 0 -15 C 4 -15 6 -14 6 -12 L 6 -8 L 7.5 -7 L 7.5 8 L 6 9 L 6 13 C 6 14.5 4.5 15 0 15 C -4.5 15 -6 14.5 -6 13 L -6 9 L -7.5 8 L -7.5 -7 L -6 -8 Z M -4 -10 L 4 -10 L 5 -4 L -5 -4 Z M -4 2 L 4 2 L 5 9 L -5 9 Z",
            fillColor: "#0f3a22", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1.2, scale: 1.1,
            anchor: new g.maps.Point(0, 0), rotation: 0,
          },
        });

      } else {
        driverMarkerRef.current.setPosition(driver);
      }
    })();
  }, [driver?.lat, driver?.lng]);

  return <div ref={ref} className="w-full rounded-2xl overflow-hidden border border-border" style={{ height }} />;
}
