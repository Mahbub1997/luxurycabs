import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/maps/load-maps";
import { reverseGeocode } from "@/lib/maps/geocode.functions";
import { MapPin, Loader2, Map as MapIcon, X } from "lucide-react";
import { MapPicker } from "@/components/MapPicker";

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
  /** Auto-detect device location on mount if no value is set. */
  autoDetect?: boolean;
}

export function PlaceAutocomplete({
  label, value, onChange, placeholder, accent = "green", autoDetect = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const tokenRef = useRef<any>(null);
  const triedAutoRef = useRef(false);

  // Auto-detect once on mount (pickup only).
  useEffect(() => {
    if (!autoDetect || value || triedAutoRef.current) return;
    triedAutoRef.current = true;
    if (!navigator.geolocation) return;
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          let address = "";
          try {
            const r = await reverseGeocode({ data: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
            address = r.address;
          } catch (e) { console.warn("Reverse geocode failed", e); }
          onChange({
            address: address || "Detected location",
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        } finally { setDetecting(false); }
      },

      () => setDetecting(false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, [autoDetect, value, onChange]);

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

  const dotColor = accent === "red" ? "text-destructive" : "text-primary";
  const dotBg = accent === "red" ? "bg-destructive/10" : "bg-primary/10";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-w-0 items-start gap-3 text-left"
      >
        <MapPin className={`mt-1 h-4 w-4 shrink-0 ${dotColor}`} />
        <div className="min-w-0 flex-1">
          <div className={`text-xs font-medium ${dotColor}`}>{label}</div>
          <div className={`truncate text-sm font-semibold ${dotColor}`}>
            {detecting ? (
              <span className="inline-flex items-center gap-1.5 opacity-80 font-normal">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Detecting current location…
              </span>
            ) : value?.address ? (
              value.address
            ) : (
              <span className={`${dotColor} opacity-70 font-normal`}>{placeholder ?? "Search location"}</span>
            )}
          </div>
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <button onClick={() => setOpen(false)} className="rounded-md p-2 text-muted-foreground hover:bg-muted">
              <X className="h-5 w-5" />
            </button>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Enter ${label.toLowerCase()}`}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          {!query && (
            <div className="border-b border-border">
              <button
                onClick={() => setPickerOpen(true)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted"
              >
                <div className={`grid h-9 w-9 place-items-center rounded-full ${dotBg} ${dotColor}`}>
                  <MapIcon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Choose on map</div>
                  <div className="text-xs text-muted-foreground">Drop a pin anywhere</div>
                </div>
              </button>
            </div>
          )}

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

      <MapPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initial={value ? { lat: value.lat, lng: value.lng } : null}
        onPick={(p) => {
          onChange(p);
          setPickerOpen(false);
          setOpen(false);
        }}
      />
    </>
  );
}
