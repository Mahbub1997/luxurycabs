import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/maps/load-maps";
import { MapPin, Loader2 } from "lucide-react";

export interface PlacePick {
  address: string;
  lat: number;
  lng: number;
}

interface Props {
  label: string;
  value?: PlacePick | null;
  onChange: (p: PlacePick) => void;
  placeholder?: string;
  accent?: "green" | "red";
}

export function PlaceAutocomplete({ label, value, onChange, placeholder, accent = "green" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const tokenRef = useRef<any>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!query.trim()) { setSuggestions([]); return; }
      setLoading(true);
      try {
        const g = await loadGoogleMaps();
        const { AutocompleteSessionToken, AutocompleteSuggestion } =
          (await g.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: tokenRef.current,
          includedRegionCodes: ["in"],
        });
        if (!cancelled) setSuggestions(suggestions);
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open]);

  async function pick(s: any) {
    try {
      const place = s.placePrediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location", "displayName"] });
      onChange({
        address: place.formattedAddress ?? place.displayName ?? "",
        lat: place.location!.lat(),
        lng: place.location!.lng(),
      });
      setOpen(false);
      setQuery("");
      setSuggestions([]);
      tokenRef.current = null;
    } catch (e) { console.error(e); }
  }

  async function useCurrent() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported on this device.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const g = await loadGoogleMaps();
          const geocoder = new g.maps.Geocoder();
          let address = "Current location";
          try {
            const { results } = await geocoder.geocode({
              location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            });
            address = results[0]?.formatted_address ?? address;
          } catch (e) { console.warn("Reverse geocode failed", e); }
          onChange({
            address,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setOpen(false);
        } finally { setLoading(false); }
      },
      (err) => {
        setLoading(false);
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Please enable location access in your browser settings."
            : err.code === err.POSITION_UNAVAILABLE
            ? "Unable to determine your location. Try again outdoors or enter address manually."
            : "Location request timed out. Please try again.";
        alert(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  const dotColor = accent === "red" ? "text-destructive" : "text-primary";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-start gap-3 text-left"
      >
        <MapPin className={`mt-1 h-4 w-4 shrink-0 ${dotColor}`} />
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-medium ${dotColor}`}>{label}</div>
          <div className="truncate text-sm font-semibold text-foreground">
            {value?.address ?? <span className="text-muted-foreground font-normal">{placeholder ?? "Search location"}</span>}
          </div>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <button onClick={() => setOpen(false)} className="rounded-md p-2 text-muted-foreground hover:bg-muted">✕</button>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Enter ${label.toLowerCase()}`}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <button
            onClick={useCurrent}
            className="flex items-center gap-3 border-b border-border px-4 py-3 text-left hover:bg-muted"
          >
            <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-primary">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">Use current location</div>
              <div className="text-xs text-muted-foreground">Detect via GPS</div>
            </div>
          </button>
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center p-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
            {!loading && suggestions.map((s, i) => {
              const main = s.placePrediction?.mainText?.text ?? "";
              const sec = s.placePrediction?.secondaryText?.text ?? "";
              return (
                <button
                  key={i}
                  onClick={() => pick(s)}
                  className="flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left hover:bg-muted"
                >
                  <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{main}</div>
                    <div className="truncate text-xs text-muted-foreground">{sec}</div>
                  </div>
                </button>
              );
            })}
            {!loading && query && suggestions.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">No matches</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
