import { decode } from "@googlemaps/polyline-codec";

export type LatLng = { lat: number; lng: number };

/**
 * Animate movement along an encoded polyline. Calls onTick every `intervalMs`
 * with the current position (linearly interpolated by cumulative distance).
 * Resolves when the end is reached. Returns a cancel fn.
 */
export function simulateDrive(opts: {
  polyline: string;
  totalMs: number;
  intervalMs?: number;
  onTick: (p: LatLng, progress: number) => void;
  onDone?: () => void;
}): () => void {
  const interval = opts.intervalMs ?? 2500;
  const path = decode(opts.polyline).map(([lat, lng]) => ({ lat, lng }));
  if (path.length < 2) {
    opts.onTick(path[0] ?? { lat: 0, lng: 0 }, 1);
    opts.onDone?.();
    return () => {};
  }
  // cumulative distances
  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversine(path[i - 1], path[i]));
  }
  const total = cum[cum.length - 1];
  const start = Date.now();
  let cancelled = false;

  function step() {
    if (cancelled) return;
    const elapsed = Date.now() - start;
    const progress = Math.min(1, elapsed / opts.totalMs);
    const target = total * progress;
    // find segment
    let i = 1;
    while (i < cum.length && cum[i] < target) i++;
    const segStart = path[i - 1];
    const segEnd = path[Math.min(i, path.length - 1)];
    const segLen = cum[i] - cum[i - 1] || 1;
    const t = (target - cum[i - 1]) / segLen;
    const pos = {
      lat: segStart.lat + (segEnd.lat - segStart.lat) * t,
      lng: segStart.lng + (segEnd.lng - segStart.lng) * t,
    };
    opts.onTick(pos, progress);
    if (progress >= 1) {
      opts.onDone?.();
      return;
    }
    setTimeout(step, interval);
  }
  step();
  return () => { cancelled = true; };
}

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Offset a lat/lng by an approx distance (km) in a bearing (deg). */
export function offsetLatLng(p: LatLng, distanceKm: number, bearingDeg: number): LatLng {
  const R = 6371;
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (p.lat * Math.PI) / 180;
  const lng1 = (p.lng * Math.PI) / 180;
  const dr = distanceKm / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(lat1), Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}
