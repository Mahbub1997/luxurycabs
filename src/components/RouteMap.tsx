import { useEffect, useRef, useState } from "react";
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
  showMyLocation?: boolean;
}

type Status = "loading" | "ready" | "error";

export function RouteMap({ pickup, drop, polyline, driver, height = 260, fitKey = 0, showMyLocation = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const meMarkerRef = useRef<google.maps.Marker | null>(null);
  const meAccuracyRef = useRef<google.maps.Circle | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const [errorMsg, setErrorMsg] = useState<string>("");

  // Init map + base markers ONLY when endpoints change (not on polyline change).
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
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

        const bounds = new g.maps.LatLngBounds();
        bounds.extend(pickup);
        bounds.extend(drop);
        map.fitBounds(bounds, 48);

        g.maps.event.addListenerOnce(map, "idle", () => {
          if (!cancelled) setStatus("ready");
        });
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "Failed to load map");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.lat, pickup.lng, drop.lat, drop.lng, fitKey]);

  // Draw / update the polyline overlay without re-creating the map.
  useEffect(() => {
    (async () => {
      const g = await loadGoogleMaps().catch(() => null);
      if (!g || !mapRef.current) return;
      polylineRef.current?.setMap(null);
      const path = polyline ? decode(polyline).map(([lat, lng]) => ({ lat, lng })) : [pickup, drop];
      polylineRef.current = new g.maps.Polyline({
        path, map: mapRef.current,
        strokeColor: "#1f6f3f", strokeOpacity: 0.9, strokeWeight: 5,
      });
      if (polyline) {
        const bounds = new g.maps.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        mapRef.current.fitBounds(bounds, 48);
      }
    })();
  }, [polyline, pickup.lat, pickup.lng, drop.lat, drop.lng]);

  // Driver marker
  useEffect(() => {
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (!mapRef.current || !driver) return;
        if (!driverMarkerRef.current) {
          driverMarkerRef.current = new g.maps.Marker({
            map: mapRef.current,
            position: driver,
            icon: {
              path: "M -7 -13 C -7 -15 -5 -16 0 -16 C 5 -16 7 -15 7 -13 L 7 -7 L 8.5 -6 L 8.5 11 L 7 12 L 7 15 C 7 16.5 5 17 0 17 C -5 17 -7 16.5 -7 15 L -7 12 L -8.5 11 L -8.5 -6 L -7 -7 Z M -5 -11 L 5 -11 L 6 -4 L -6 -4 Z M -6 1 L 6 1 L 6 3 L -6 3 Z M -5 6 L 5 6 L 6 13 L -6 13 Z",
              fillColor: "#0f3a22", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 1.5, scale: 1.2,
              anchor: new g.maps.Point(0, 0), rotation: 0,
            },
          });
        } else {
          driverMarkerRef.current.setPosition(driver);
        }
      } catch {
        // map load error already surfaced by main effect
      }
    })();
  }, [driver?.lat, driver?.lng]);

  // My current location (blue dot)
  useEffect(() => {
    if (!showMyLocation) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let watchId: number | null = null;
    let cancelled = false;
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled || !mapRef.current) return;
        const update = (pos: GeolocationPosition) => {
          if (!mapRef.current) return;
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (!meMarkerRef.current) {
            meMarkerRef.current = new g.maps.Marker({
              map: mapRef.current,
              position: p,
              zIndex: 9999,
              icon: {
                path: g.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: "#1a73e8",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3,
              },
            });
            meAccuracyRef.current = new g.maps.Circle({
              map: mapRef.current,
              center: p,
              radius: Math.max(20, pos.coords.accuracy || 30),
              fillColor: "#1a73e8",
              fillOpacity: 0.15,
              strokeColor: "#1a73e8",
              strokeOpacity: 0.35,
              strokeWeight: 1,
              clickable: false,
            });
          } else {
            meMarkerRef.current.setPosition(p);
            meAccuracyRef.current?.setCenter(p);
            meAccuracyRef.current?.setRadius(Math.max(20, pos.coords.accuracy || 30));
          }
        };
        watchId = navigator.geolocation.watchPosition(update, () => {}, {
          enableHighAccuracy: true, maximumAge: 5000, timeout: 15000,
        });
      } catch { /* ignore */ }
    })();
    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      meMarkerRef.current?.setMap(null);
      meMarkerRef.current = null;
      meAccuracyRef.current?.setMap(null);
      meAccuracyRef.current = null;
    };
  }, [showMyLocation, status]);


  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-border bg-muted"
      style={{ height }}
    >
      <div ref={ref} className="absolute inset-0" />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/80 animate-pulse">
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm">
            <div className="h-6 w-6 rounded-full border-2 border-current border-t-transparent animate-spin" />
            <span>Loading map…</span>
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted p-4 text-center">
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Map unavailable</p>
            <p className="text-xs">{errorMsg || "Please check your connection and try again."}</p>
          </div>
        </div>
      )}
    </div>
  );
}
