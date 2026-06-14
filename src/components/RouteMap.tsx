import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
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
  const driverHeadingRef = useRef<number>(0);
  const lastDriverRef = useRef<{ lat: number; lng: number } | null>(null);
  const meMarkerRef = useRef<google.maps.Marker | null>(null);
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

  // Driver marker (rotates to face direction of movement)
  useEffect(() => {
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (!mapRef.current || !driver) return;

        // compute heading from previous position
        const prev = lastDriverRef.current;
        if (prev && (prev.lat !== driver.lat || prev.lng !== driver.lng)) {
          const dKm = Math.hypot(prev.lat - driver.lat, prev.lng - driver.lng);
          if (dKm > 0.00002) {
            const heading = g.maps.geometry?.spherical?.computeHeading
              ? g.maps.geometry.spherical.computeHeading(
                  new g.maps.LatLng(prev.lat, prev.lng),
                  new g.maps.LatLng(driver.lat, driver.lng)
                )
              : (Math.atan2(driver.lng - prev.lng, driver.lat - prev.lat) * 180) / Math.PI;
            driverHeadingRef.current = heading;
          }
        }
        lastDriverRef.current = { lat: driver.lat, lng: driver.lng };

        const carIcon: google.maps.Symbol = {
          // top-down car shape pointing UP (north). Rotation rotates around anchor.
          path: "M 0 -16 C 4 -16 6 -14 6 -10 L 6 -2 L 7 0 L 7 12 L 6 14 L 6 16 C 6 17 4 17.5 0 17.5 C -4 17.5 -6 17 -6 16 L -6 14 L -7 12 L -7 0 L -6 -2 L -6 -10 C -6 -14 -4 -16 0 -16 Z M -4 -10 L 4 -10 L 5 -3 L -5 -3 Z M -5 4 L 5 4 L 5 11 L -5 11 Z",
          fillColor: "#0f3a22",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 1.5,
          scale: 1.2,
          anchor: new g.maps.Point(0, 0),
          rotation: driverHeadingRef.current,
        };

        if (!driverMarkerRef.current) {
          driverMarkerRef.current = new g.maps.Marker({
            map: mapRef.current,
            position: driver,
            icon: carIcon,
            zIndex: 5000,
          });
        } else {
          driverMarkerRef.current.setPosition(driver);
          driverMarkerRef.current.setIcon(carIcon);
        }
      } catch {
        // map load error already surfaced by main effect
      }
    })();
  }, [driver?.lat, driver?.lng]);

  // My current location (crosshair / aim icon)
  useEffect(() => {
    if (!showMyLocation) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let watchId: number | null = null;
    let cancelled = false;
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled || !mapRef.current) return;
        const aimIcon: google.maps.Symbol = {
          // Crosshair / aim: outer ring + cross lines + center dot
          path: "M 0 -12 L 0 -6 M 0 6 L 0 12 M -12 0 L -6 0 M 6 0 L 12 0 M 0 0 m -10 0 a 10 10 0 1 0 20 0 a 10 10 0 1 0 -20 0 M 0 0 m -2 0 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0",
          strokeColor: "#0f3a22",
          strokeWeight: 2.2,
          strokeOpacity: 1,
          fillColor: "#0f3a22",
          fillOpacity: 1,
          scale: 1,
          anchor: new g.maps.Point(0, 0),
        };
        const update = (pos: GeolocationPosition) => {
          if (!mapRef.current) return;
          const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (!meMarkerRef.current) {
            meMarkerRef.current = new g.maps.Marker({
              map: mapRef.current,
              position: p,
              zIndex: 9999,
              icon: aimIcon,
            });
          } else {
            meMarkerRef.current.setPosition(p);
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
    };
  }, [showMyLocation, status]);



  function recenterToMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapRef.current!.panTo(p);
        mapRef.current!.setZoom(Math.max(mapRef.current!.getZoom() ?? 14, 16));
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-border bg-muted"
      style={{ height }}
    >
      <div ref={ref} className="absolute inset-0" />
      {showMyLocation && status === "ready" && (
        <button
          type="button"
          onClick={recenterToMe}
          aria-label="Center on my location"
          className="absolute bottom-3 right-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-border bg-card text-primary shadow-lg active:scale-95"
        >
          <LocateFixed className="h-5 w-5" />
        </button>
      )}
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
