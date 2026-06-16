import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/maps/load-maps";
import { reverseGeocode } from "@/lib/maps/geocode.functions";
import { Loader2, MapPin, X } from "lucide-react";
import type { PlacePick } from "@/components/PlaceAutocomplete";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (p: PlacePick) => void;
  initial?: { lat: number; lng: number } | null;
}

export function MapPicker({ open, onClose, onPick, initial }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  const movingRef = useRef(false);
  const mapReadyRef = useRef(false);
  const lastFetchedRef = useRef<{ lat: number; lng: number } | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const g = await loadGoogleMaps();
      if (cancelled || !ref.current) return;
      const start =
        initial ??
        (await new Promise<{ lat: number; lng: number }>((res) => {
          if (!navigator.geolocation) return res({ lat: 12.9716, lng: 77.5946 });
          navigator.geolocation.getCurrentPosition(
            (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => res({ lat: 12.9716, lng: 77.5946 }),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        }));
      const map = new g.maps.Map(ref.current, {
        center: start,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
      });
      mapRef.current = map;
      setCenter(start);

      // Detect user-initiated movement (drag or zoom). Mark as moving;
      // idle will fire when movement stops.
      const onUserMove = () => {
        if (!mapReadyRef.current) return;
        if (movingRef.current) return;
        movingRef.current = true;
        setMoving(true);
        if (debounceRef.current) {
          window.clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        reqIdRef.current += 1; // cancel any in-flight request
      };
      map.addListener("dragstart", onUserMove);
      map.addListener("zoom_changed", onUserMove);

      // Idle fires when the camera fully settles. We fetch once after idle,
      // never while the user is moving the map.
      map.addListener("idle", () => {
        const c = map.getCenter();
        if (!c) return;
        const p = { lat: c.lat(), lng: c.lng() };
        setCenter(p);
        mapReadyRef.current = true;
        const shouldFetch = movingRef.current || !lastFetchedRef.current;
        movingRef.current = false;
        setMoving(false);
        if (!shouldFetch) return;
        // Skip refetch if center hasn't actually changed enough.
        const last = lastFetchedRef.current;
        if (last && Math.abs(last.lat - p.lat) < 0.00003 && Math.abs(last.lng - p.lng) < 0.00003) {
          return;
        }
        scheduleReverse(p);
      });
    })();
    return () => {
      cancelled = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      reqIdRef.current += 1;
      movingRef.current = false;
      mapReadyRef.current = false;
    };
  }, [open]);

  function scheduleReverse(p: { lat: number; lng: number }) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      void reverse(p);
    }, 400);
  }

  async function reverse(p: { lat: number; lng: number }) {
    const myId = ++reqIdRef.current;
    setAddress("");
    setLoading(true);
    try {
      const r = await reverseGeocode({ data: p });
      if (myId !== reqIdRef.current) return;
      setAddress(r.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
      lastFetchedRef.current = p;
    } catch {
      if (myId !== reqIdRef.current) return;
      setAddress(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
      lastFetchedRef.current = p;
    } finally {
      // Always clear the spinner so it never gets stuck
      if (myId === reqIdRef.current) setLoading(false);
    }
  }

  if (!open) return null;
  const showFetching = moving || loading;
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <button onClick={onClose} className="rounded-md p-2 text-muted-foreground hover:bg-muted">
          <X className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold">Choose on map</div>
      </div>
      <div className="relative flex-1">
        <div ref={ref} className="absolute inset-0" />
        {/* Fixed center pin — stays put while map moves underneath */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
          <MapPin className="h-9 w-9 fill-primary text-primary drop-shadow" />
        </div>
      </div>
      <div className="border-t border-border bg-card p-3">
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 text-primary" />
          <span className="flex-1 font-medium">
            {showFetching ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching location…
              </span>
            ) : (
              address || "Move the map to choose"
            )}
          </span>
        </div>
        <button
          disabled={!center || showFetching || !address}
          onClick={() => center && onPick({ lat: center.lat, lng: center.lng, address })}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          Confirm Location
        </button>
      </div>
    </div>
  );
}
