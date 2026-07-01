import { useEffect, useRef, useState } from "react";
import { Crosshair } from "lucide-react";
import { loadGoogleMaps } from "@/lib/maps/load-maps";
import { decode } from "@googlemaps/polyline-codec";
import { realisticCarTop } from "@/components/VehicleIcon";


interface Props {
  pickup: { lat: number; lng: number };
  drop: { lat: number; lng: number };
  polyline?: string | null;
  driver?: { lat: number; lng: number } | null;
  driverPlate?: string | null;
  driverVehicleKind?: "sedan" | "suv";
  height?: number | string;
  interactive?: boolean;
  fitKey?: number | string;
  showMyLocation?: boolean;
  followDriver?: boolean;
}

type Status = "loading" | "ready" | "error";

const SOUTH_INDIA_BOUNDS = { north: 21.5, south: 5.5, west: 72, east: 86.5 };

function bearingBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function approxMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dx = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const dy = (b.lat - a.lat) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Project `p` onto the closest segment of `path` (returns the snapped point).
 *  Used so the moving vehicle marker rides the road polyline instead of
 *  cutting straight lines between noisy GPS samples. */
function snapToPath(
  p: { lat: number; lng: number },
  path: Array<{ lat: number; lng: number }>
): { lat: number; lng: number } | null {
  if (!path || path.length < 2) return null;
  const latRad = (p.lat * Math.PI) / 180;
  const mPerDegLng = 111_320 * Math.cos(latRad);
  const mPerDegLat = 110_540;
  const toXY = (q: { lat: number; lng: number }) => ({
    x: (q.lng - p.lng) * mPerDegLng,
    y: (q.lat - p.lat) * mPerDegLat,
  });
  let best: { lat: number; lng: number } | null = null;
  let bestDist = Infinity;
  // Only consider segments within ~80m of p for performance + sanity.
  const MAX = 80;
  for (let i = 0; i < path.length - 1; i++) {
    const a = toXY(path[i]);
    const b = toXY(path[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = -(a.x * dx + a.y * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const d2 = px * px + py * py;
    if (d2 < bestDist) {
      bestDist = d2;
      const lat = path[i].lat + t * (path[i + 1].lat - path[i].lat);
      const lng = path[i].lng + t * (path[i + 1].lng - path[i].lng);
      best = { lat, lng };
    }
  }
  if (!best || Math.sqrt(bestDist) > MAX) return null;
  return best;
}

function phaseZoom(currentZoom: number, distanceToPickup: number, distanceToDrop: number) {
  const nearest = Math.min(distanceToPickup, distanceToDrop);
  if (nearest < 200) return Math.min(Math.max(currentZoom, 15), 17);
  if (nearest < 1000) return Math.min(Math.max(currentZoom, 14), 16);
  return Math.min(currentZoom, 13);
}

type PathPoint = { lat: number; lng: number };

type CarOverlay = google.maps.OverlayView & {
  setPosition(position: PathPoint): void;
  setHeading(heading: number): void;
};

function closestPointOnPath(p: PathPoint, path: PathPoint[]) {
  if (!path || path.length < 2) return null;
  const latRad = (p.lat * Math.PI) / 180;
  const mPerDegLng = 111_320 * Math.cos(latRad);
  const mPerDegLat = 110_540;
  const toXY = (q: PathPoint) => ({ x: (q.lng - p.lng) * mPerDegLng, y: (q.lat - p.lat) * mPerDegLat });
  let best: { point: PathPoint; distanceAlong: number; distanceFromRoute: number; heading: number } | null = null;
  let walked = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = toXY(path[i]);
    const b = toXY(path[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const segmentLength = approxMeters(path[i], path[i + 1]);
    if (len2 === 0 || segmentLength === 0) continue;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const distanceFromRoute = Math.sqrt(px * px + py * py);
    if (!best || distanceFromRoute < best.distanceFromRoute) {
      best = {
        point: { lat: path[i].lat + t * (path[i + 1].lat - path[i].lat), lng: path[i].lng + t * (path[i + 1].lng - path[i].lng) },
        distanceAlong: walked + segmentLength * t,
        distanceFromRoute,
        heading: bearingBetween(path[i], path[i + 1]),
      };
    }
    walked += segmentLength;
  }
  return best && best.distanceFromRoute <= 100 ? best : null;
}

function pointAtPathDistance(path: PathPoint[], distanceAlong: number) {
  if (path.length < 2) return { point: path[0], heading: 0 };
  const total = path.reduce((sum, p, i) => i === 0 ? 0 : sum + approxMeters(path[i - 1], p), 0);
  let remaining = Math.max(0, Math.min(distanceAlong, total));
  for (let i = 0; i < path.length - 1; i++) {
    const segmentLength = approxMeters(path[i], path[i + 1]);
    if (remaining <= segmentLength || i === path.length - 2) {
      const t = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        point: { lat: path[i].lat + t * (path[i + 1].lat - path[i].lat), lng: path[i].lng + t * (path[i + 1].lng - path[i].lng) },
        heading: bearingBetween(path[i], path[i + 1]),
      };
    }
    remaining -= segmentLength;
  }
  return { point: path[path.length - 1], heading: bearingBetween(path[path.length - 2], path[path.length - 1]) };
}

function smoothHeading(from: number, to: number, amount: number) {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * amount + 360) % 360;
}

function createCarOverlay(g: typeof google, map: google.maps.Map, initialPosition: PathPoint, initialHeading: number): CarOverlay {
  class RealCarOverlay extends g.maps.OverlayView {
    private div: HTMLDivElement | null = null;
    private position = initialPosition;
    private heading = initialHeading;

    onAdd() {
      const div = document.createElement("div");
      div.style.position = "absolute";
      div.style.width = "64px";
      div.style.height = "64px";
      div.style.pointerEvents = "none";
      div.style.transformOrigin = "center center";
      div.style.willChange = "transform";
      div.innerHTML = `<img src="${realisticCarTop}" alt="Live car" style="width:64px;height:64px;object-fit:contain;display:block;filter:drop-shadow(0 3px 4px rgba(0,0,0,.38));" />`;
      this.div = div;
      this.getPanes()?.overlayMouseTarget.appendChild(div);
    }

    draw() {
      if (!this.div) return;
      const projection = this.getProjection();
      const point = projection.fromLatLngToDivPixel(new g.maps.LatLng(this.position.lat, this.position.lng));
      if (!point) return;
      this.div.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%) rotate(${this.heading.toFixed(1)}deg)`;
    }

    onRemove() {
      this.div?.remove();
      this.div = null;
    }

    setPosition(next: PathPoint) {
      this.position = next;
      this.draw();
    }

    setHeading(next: number) {
      this.heading = next;
      this.draw();
    }
  }

  const overlay = new RealCarOverlay() as CarOverlay;
  overlay.setMap(map);
  return overlay;
}

export function RouteMap({ pickup, drop, polyline, driver, driverPlate, driverVehicleKind = "sedan", height = 260, fitKey = 0, showMyLocation = false, followDriver = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const polyPathRef = useRef<Array<{ lat: number; lng: number }>>([]);
  const polyFittedRef = useRef(false);
  const carOverlayRef = useRef<CarOverlay | null>(null);
  const driverPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const driverRouteDistanceRef = useRef<number | null>(null);
  const animRef = useRef<number | null>(null);
  const driverHeadingRef = useRef(0);
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
        carOverlayRef.current?.setMap(null);
        carOverlayRef.current = null;
        meMarkerRef.current?.setMap(null);
        meMarkerRef.current = null;
        const map = new g.maps.Map(ref.current, {
          center: pickup,
          zoom: 13,
          restriction: { latLngBounds: SOUTH_INDIA_BOUNDS, strictBounds: false },
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
          icon: { path: g.maps.SymbolPath.CIRCLE, scale: 3, fillColor: "#0f7a3a", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 0.75 },
        });
        new g.maps.Marker({
          position: drop, map,
          icon: { path: "M12 0C7 0 3 4 3 9c0 7 9 15 9 15s9-8 9-15c0-5-4-9-9-9z", fillColor: "#e23b3b", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 1.5, scale: 1.4, anchor: new g.maps.Point(12, 24) },
        });

        const bounds = new g.maps.LatLngBounds();
        bounds.extend(pickup);
        bounds.extend(drop);
        if (driver) bounds.extend(driver);
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
      if (animRef.current !== null) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      polyPathRef.current = [];
      polyFittedRef.current = false;
      carOverlayRef.current?.setMap(null);
      carOverlayRef.current = null;
      driverPosRef.current = null;
      driverRouteDistanceRef.current = null;
      meMarkerRef.current?.setMap(null);
      meMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup.lat, pickup.lng, drop.lat, drop.lng, fitKey]);

  // Draw / update the polyline overlay without re-creating the map.
  // Only fit-to-bounds the FIRST time a polyline arrives — subsequent updates
  // (e.g. recomputed during the trip) must not jerk the camera (flicker fix).
  useEffect(() => {
    (async () => {
      const g = await loadGoogleMaps().catch(() => null);
      if (!g || !mapRef.current) return;
      polylineRef.current?.setMap(null);
      const path = polyline ? decode(polyline).map(([lat, lng]) => ({ lat, lng })) : [pickup, drop];
      polyPathRef.current = path;
      driverRouteDistanceRef.current = null;
      polylineRef.current = new g.maps.Polyline({
        path, map: mapRef.current,
        strokeColor: "#1f6f3f", strokeOpacity: 0.9, strokeWeight: 5,
      });
      if (polyline && !polyFittedRef.current) {
        const bounds = new g.maps.LatLngBounds();
        path.forEach((p) => bounds.extend(p));
        mapRef.current.fitBounds(bounds, 48);
        polyFittedRef.current = true;
      }
    })();
  }, [polyline, pickup.lat, pickup.lng, drop.lat, drop.lng]);

  // Driver car — real PNG overlay, center anchored, route-distance interpolation.
  useEffect(() => {
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (!mapRef.current || !driver) return;

        const routePoint = closestPointOnPath(driver, polyPathRef.current);
        const currentDistance = driverRouteDistanceRef.current;
        const nextDistance = routePoint && currentDistance !== null
          ? Math.max(routePoint.distanceAlong, currentDistance)
          : routePoint?.distanceAlong ?? null;
        const routedTarget = nextDistance !== null ? pointAtPathDistance(polyPathRef.current, nextDistance) : null;
        const target = routedTarget?.point ?? routePoint?.point ?? driver;
        const targetDistance = nextDistance;
        const targetHeading = routedTarget?.heading ?? routePoint?.heading ?? (driverPosRef.current ? bearingBetween(driverPosRef.current, target) : driverHeadingRef.current);

        const isFirst = !carOverlayRef.current;
        if (!carOverlayRef.current) {
          carOverlayRef.current = createCarOverlay(g, mapRef.current, target, targetHeading);
          driverPosRef.current = target;
          driverRouteDistanceRef.current = targetDistance;
          driverHeadingRef.current = targetHeading;
        }

        // Cancel any in-flight animation before starting a new one.
        if (animRef.current !== null) {
          cancelAnimationFrame(animRef.current);
          animRef.current = null;
        }

        const currentPos = driverPosRef.current ?? target;
        const distance = approxMeters(currentPos, target);
        const overlay = carOverlayRef.current;
        if (!overlay) return;
        if (isFirst || distance < 0.5 || distance > 500) {
          overlay.setPosition(target);
          overlay.setHeading(targetHeading);
          driverPosRef.current = target;
          driverRouteDistanceRef.current = targetDistance;
          driverHeadingRef.current = targetHeading;
        } else {
          const from = currentPos;
          const fromDistance = currentDistance ?? null;
          const toDistance = targetDistance;
          const duration = 900;
          const t0 = performance.now();
          const step = (now: number) => {
            const k = Math.min(1, (now - t0) / duration);
            const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            const p = fromDistance !== null && toDistance !== null
              ? pointAtPathDistance(polyPathRef.current, fromDistance + (toDistance - fromDistance) * e).point
              : { lat: from.lat + (target.lat - from.lat) * e, lng: from.lng + (target.lng - from.lng) * e };
            const liveHeading = fromDistance !== null && toDistance !== null
              ? pointAtPathDistance(polyPathRef.current, fromDistance + (toDistance - fromDistance) * e).heading
              : bearingBetween(driverPosRef.current ?? from, p);
            driverHeadingRef.current = smoothHeading(driverHeadingRef.current, liveHeading, 0.18);
            overlay.setPosition(p);
            overlay.setHeading(driverHeadingRef.current);
            driverPosRef.current = p;
            if (k < 1) {
              animRef.current = requestAnimationFrame(step);
            } else {
              animRef.current = null;
              driverPosRef.current = target;
              driverRouteDistanceRef.current = targetDistance;
              driverHeadingRef.current = smoothHeading(driverHeadingRef.current, targetHeading, 0.35);
              overlay.setPosition(target);
              overlay.setHeading(driverHeadingRef.current);
            }
          };
          animRef.current = requestAnimationFrame(step);
        }

        if (followDriver) {
          if (isFirst) {
            const bounds = new g.maps.LatLngBounds();
            bounds.extend(pickup);
            bounds.extend(drop);
            bounds.extend(target);
            mapRef.current.fitBounds(bounds, 64);
          } else {
            mapRef.current.panTo(target);
          }
        }
      } catch {
        // map load error already surfaced by main effect
      }
    })();
  }, [driver?.lat, driver?.lng, followDriver]);

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
          className="absolute bottom-3 right-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-foreground/20 bg-white text-foreground shadow-lg active:scale-95"
        >
          <Crosshair className="h-5 w-5" strokeWidth={2.2} />
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
