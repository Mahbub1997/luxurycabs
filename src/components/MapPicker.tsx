import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/maps/load-maps";
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
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState<string>("");
  const [loading, setLoading] = useState(false);

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
      reverse(start);
      map.addListener("idle", () => {
        const c = map.getCenter();
        if (!c) return;
        const p = { lat: c.lat(), lng: c.lng() };
        setCenter(p);
        reverse(p);
      });
    })();
    return () => { cancelled = true; };
  }, [open]);

  async function reverse(p: { lat: number; lng: number }) {
    setLoading(true);
    try {
      const g = await loadGoogleMaps();
      const geocoder = new g.maps.Geocoder();
      const { results } = await geocoder.geocode({ location: p });
      setAddress(results[0]?.formatted_address ?? "Selected location");
    } catch {
      setAddress("Selected location");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;
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
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
          <MapPin className="h-9 w-9 fill-primary text-primary drop-shadow" />
        </div>
      </div>
      <div className="border-t border-border bg-card p-3">
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 h-4 w-4 text-primary" />
          <span className="flex-1 font-medium">
            {loading ? "Locating…" : address || "Move the map to choose"}
          </span>
        </div>
        <button
          disabled={!center || loading}
          onClick={() => center && onPick({ lat: center.lat, lng: center.lng, address })}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirm Location
        </button>
      </div>
    </div>
  );
}
