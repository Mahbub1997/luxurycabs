import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock, Loader2, MapPin, Search, Users, X, ChevronRight } from "lucide-react";
import { loadGoogleMaps } from "@/lib/maps/load-maps";
import { reverseGeocode } from "@/lib/maps/geocode.functions";
import { computeRoute } from "@/lib/maps/routes.functions";
import { calcLocalFare, formatINR, useFareRates, type VehicleType } from "@/lib/fare";
import type { PlacePick } from "@/components/PlaceAutocomplete";
import sedanImg from "@/assets/sedan.png";
import suvImg from "@/assets/suv.png";
import { cn } from "@/lib/utils";
import { VehicleCard } from "@/components/VehicleCard";

type Stage = "pickup" | "drop" | "vehicle";

// South India bounds (Tamil Nadu, Karnataka, Kerala + buffer)
const SOUTH_INDIA = { south: 8.0, west: 74.0, north: 16.2, east: 81.0 };
const RECENT_KEY = "luxury_recent_places";
const MAX_RECENT = 5;

function readRecent(): PlacePick[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr: PlacePick[] = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, MAX_RECENT) : [];
  } catch { return []; }
}
function pushRecent(p: PlacePick) {
  if (typeof window === "undefined" || !p?.address) return;
  const prev = readRecent().filter(
    (x) => x.address !== p.address || Math.abs(x.lat - p.lat) > 1e-5 || Math.abs(x.lng - p.lng) > 1e-5
  );
  const next = [p, ...prev].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
}

interface Props {
  open: boolean;
  initialPickup?: PlacePick | null;
  initialDrop?: PlacePick | null;
  onClose: () => void;
  onComplete: (r: { pickup: PlacePick; drop: PlacePick; vehicle: VehicleType }) => void;
}

export function PickDropFlow({ open, initialPickup, initialDrop, onClose, onComplete }: Props) {
  const mapHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const pickupMarkerRef = useRef<google.maps.Marker | null>(null);
  const dropMarkerRef = useRef<google.maps.Marker | null>(null);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const moveListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const debounceRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);
  const movingRef = useRef(false);

  const [stage, setStage] = useState<Stage>(initialPickup ? "drop" : "pickup");
  const [pickup, setPickup] = useState<PlacePick | null>(initialPickup ?? null);
  const [drop, setDrop] = useState<PlacePick | null>(initialDrop ?? null);

  const [centerAddress, setCenterAddress] = useState("");
  const [centerLoading, setCenterLoading] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [recent, setRecent] = useState<PlacePick[]>([]);
  const tokenRef = useRef<any>(null);

  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number; polyline: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleType>("sedan");
  const [showAllVehicles, setShowAllVehicles] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const { rates } = useFareRates();

  // Init map once when opened.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const g = await loadGoogleMaps();
      if (cancelled || !mapHostRef.current || mapRef.current) return;

      const start = initialPickup
        ? { lat: initialPickup.lat, lng: initialPickup.lng }
        : await new Promise<{ lat: number; lng: number }>((res) => {
            if (!navigator.geolocation) return res({ lat: 12.9716, lng: 77.5946 });
            navigator.geolocation.getCurrentPosition(
              (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
              () => res({ lat: 12.9716, lng: 77.5946 }),
              { enableHighAccuracy: true, timeout: 8000 }
            );
          });

      const map = new g.maps.Map(mapHostRef.current, {
        center: start,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
        restriction: {
          latLngBounds: SOUTH_INDIA,
          strictBounds: false,
        },
      });
      mapRef.current = map;
      attachIdleListener();
      // Initial reverse geocode for pickup stage
      if (!initialPickup) {
        scheduleReverse(start);
      } else {
        setCenterAddress(initialPickup.address);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Clean up everything when closed
  useEffect(() => {
    if (open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    moveListenersRef.current.forEach((l) => l.remove());
    moveListenersRef.current = [];
    idleListenerRef.current?.remove();
    idleListenerRef.current = null;
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    pickupMarkerRef.current?.setMap(null);
    pickupMarkerRef.current = null;
    dropMarkerRef.current?.setMap(null);
    dropMarkerRef.current = null;
    mapRef.current = null;
    setStage(initialPickup ? "drop" : "pickup");
    setRouteInfo(null);
    setQuery("");
    setSuggestions([]);
    setSearchOpen(false);
  }, [open]);

  function attachIdleListener() {
    const map = mapRef.current;
    if (!map) return;
    moveListenersRef.current.forEach((l) => l.remove());
    idleListenerRef.current?.remove();

    const onMove = () => {
      if (stage === "vehicle") return;
      movingRef.current = true;
      setCenterLoading(true);
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      reqIdRef.current += 1;
    };
    moveListenersRef.current.push(map.addListener("dragstart", onMove));
    moveListenersRef.current.push(map.addListener("zoom_changed", onMove));

    idleListenerRef.current = map.addListener("idle", () => {
      if (stage === "vehicle") return;
      const c = map.getCenter();
      if (!c) return;
      const p = { lat: c.lat(), lng: c.lng() };
      if (!movingRef.current) return; // initial idle handled separately
      movingRef.current = false;
      scheduleReverse(p);
    });
  }

  // Re-attach when stage changes to capture current stage in closures
  useEffect(() => {
    if (mapRef.current) attachIdleListener();
  }, [stage]);

  function scheduleReverse(p: { lat: number; lng: number }) {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setCenterLoading(true);
    debounceRef.current = window.setTimeout(() => void doReverse(p), 450);
  }

  async function doReverse(p: { lat: number; lng: number }) {
    const myId = ++reqIdRef.current;
    try {
      const r = await reverseGeocode({ data: p });
      if (myId !== reqIdRef.current) return;
      setCenterAddress(r.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
    } catch {
      if (myId !== reqIdRef.current) return;
      setCenterAddress(`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`);
    } finally {
      if (myId === reqIdRef.current) setCenterLoading(false);
    }
  }

  // Search autocomplete — runs whenever the inline search box has text.
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!query.trim()) { setSuggestions([]); return; }
      setSearchLoading(true);
      try {
        const g = await loadGoogleMaps();
        const { AutocompleteSessionToken, AutocompleteSuggestion } =
          (await g.maps.importLibrary("places")) as google.maps.PlacesLibrary;
        if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: tokenRef.current,
          includedRegionCodes: ["in"],
          locationRestriction: SOUTH_INDIA,
        });
        if (!cancelled) setSuggestions(suggestions);
      } catch (e) { console.error(e); }
      finally { if (!cancelled) setSearchLoading(false); }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  useEffect(() => { setRecent(readRecent()); }, [stage]);

  async function pickSuggestion(s: any) {
    try {
      const place = s.placePrediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location", "displayName"] });
      const p: PlacePick = {
        address: place.formattedAddress ?? place.displayName ?? "",
        lat: place.location!.lat(),
        lng: place.location!.lng(),
      };
      applySearchPick(p);
    } catch (e) { console.error(e); }
  }

  function applySearchPick(p: PlacePick) {
    pushRecent(p);
    setSearchOpen(false);
    setShowSuggest(false);
    setQuery("");
    setSuggestions([]);
    tokenRef.current = null;
    setCenterAddress(p.address);
    setCenterLoading(false);
    mapRef.current?.panTo({ lat: p.lat, lng: p.lng });
    mapRef.current?.setZoom(16);
  }

  function confirmCurrent() {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (!c) return;
    const p: PlacePick = { address: centerAddress || `${c.lat().toFixed(5)}, ${c.lng().toFixed(5)}`, lat: c.lat(), lng: c.lng() };
    pushRecent(p);

    if (stage === "pickup") {
      setPickup(p);
      // Drop a static pickup marker
      pickupMarkerRef.current?.setMap(null);
      pickupMarkerRef.current = new google.maps.Marker({
        map, position: { lat: p.lat, lng: p.lng },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8, fillColor: "#16a34a", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2,
        },
      });
      setStage("drop");
      // Reset address text for drop
      setCenterAddress("");
      setCenterLoading(true);
      const ctr = map.getCenter();
      if (ctr) scheduleReverse({ lat: ctr.lat(), lng: ctr.lng() });
    } else if (stage === "drop") {
      setDrop(p);
      dropMarkerRef.current?.setMap(null);
      dropMarkerRef.current = new google.maps.Marker({
        map, position: { lat: p.lat, lng: p.lng },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8, fillColor: "#dc2626", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 2,
        },
      });
      setStage("vehicle");
      if (pickup) void drawRoute(pickup, p);
    }
  }

  async function drawRoute(a: PlacePick, b: PlacePick) {
    setRouteLoading(true);
    try {
      const r = await computeRoute({ data: { origin: { lat: a.lat, lng: a.lng }, destination: { lat: b.lat, lng: b.lng } } });
      setRouteInfo({ distanceKm: r.distanceKm, durationMin: r.durationMin, polyline: r.polyline });
      const map = mapRef.current;
      if (!map) return;
      const g = await loadGoogleMaps();
      const path = g.maps.geometry.encoding.decodePath(r.polyline);
      polylineRef.current?.setMap(null);
      polylineRef.current = new g.maps.Polyline({
        path, map, strokeColor: "#16a34a", strokeWeight: 5, strokeOpacity: 0.95,
      });
      const bounds = new g.maps.LatLngBounds();
      path.forEach((pt) => bounds.extend(pt));
      map.fitBounds(bounds, { top: 100, bottom: 280, left: 40, right: 40 });
    } catch (e) { console.error(e); }
    finally { setRouteLoading(false); }
  }

  const fares = useMemo(() => {
    if (!routeInfo) return { sedan: 0, suv: 0 };
    return {
      sedan: calcLocalFare("sedan", routeInfo.distanceKm, routeInfo.durationMin, rates),
      suv: calcLocalFare("suv", routeInfo.distanceKm, routeInfo.durationMin, rates),
    };
  }, [routeInfo, rates]);

  function handleBookNow() {
    if (!pickup || !drop) return;
    onComplete({ pickup, drop, vehicle });
  }

  function goBack() {
    if (stage === "vehicle") {
      setStage("drop");
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      dropMarkerRef.current?.setMap(null);
      dropMarkerRef.current = null;
      setRouteInfo(null);
      setDrop(null);
      if (pickup) mapRef.current?.panTo({ lat: pickup.lat, lng: pickup.lng });
    } else if (stage === "drop") {
      setStage("pickup");
      pickupMarkerRef.current?.setMap(null);
      pickupMarkerRef.current = null;
      setPickup(null);
      setCenterAddress(pickup?.address ?? "");
    } else {
      onClose();
    }
  }

  if (!open) return null;

  const stageTitle = stage === "pickup" ? "Set pickup location" : stage === "drop" ? "Set drop location" : "Choose vehicle";
  const searchPlaceholder = stage === "pickup" ? "Enter pickup location" : "Enter drop location";

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background">
      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 z-20 px-3 pt-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2 py-2 shadow-md">
          <button onClick={goBack} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 text-center text-[12px] font-bold uppercase tracking-wide text-primary truncate pr-9">
            {stageTitle}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <div ref={mapHostRef} className="absolute inset-0" />
        {/* Fixed center pin (only during pickup/drop selection) */}
        {stage !== "vehicle" && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
            <MapPin
              className={cn(
                "h-10 w-10 drop-shadow",
                stage === "pickup" ? "fill-emerald-600 text-emerald-600" : "fill-rose-600 text-rose-600"
              )}
            />
          </div>
        )}
      </div>

      {/* Bottom panel */}
      {stage !== "vehicle" ? (
        <div className="border-t border-border bg-card p-3 space-y-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          {/* Inline search box (suggestions pop ABOVE) */}
          <div className="relative">
            <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-2.5">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); setShowSuggest(true); }}
                onFocus={() => setShowSuggest(true)}
                placeholder={searchPlaceholder}
                className="flex-1 bg-transparent text-sm outline-none"
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setSuggestions([]); }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Clear"
                ><X className="h-4 w-4" /></button>
              )}
            </div>

            {showSuggest && (query.trim() || searchLoading || recent.length > 0) && (
              <div className="absolute bottom-full left-0 right-0 mb-2 max-h-72 overflow-y-auto rounded-2xl border border-border bg-card shadow-xl">
                {!query && recent.length > 0 && (
                  <>
                    <div className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Recent
                    </div>
                    {recent.map((r, i) => (
                      <button
                        key={`r-${i}`}
                        onClick={() => applySearchPick(r)}
                        className="flex w-full items-start gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-muted"
                      >
                        <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0 truncate text-sm font-semibold">{r.address}</div>
                      </button>
                    ))}
                  </>
                )}
                {searchLoading && (
                  <div className="flex items-center justify-center p-4 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
                {!searchLoading && suggestions.map((s, i) => {
                  const main = s.placePrediction?.mainText?.text ?? "";
                  const sec = s.placePrediction?.secondaryText?.text ?? "";
                  return (
                    <button
                      key={i}
                      onClick={() => pickSuggestion(s)}
                      className="flex w-full items-start gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-muted"
                    >
                      <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{main}</div>
                        <div className="truncate text-xs text-muted-foreground">{sec}</div>
                      </div>
                    </button>
                  );
                })}
                {!searchLoading && query.trim() && suggestions.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">No matches</div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 text-sm">
            <MapPin className={stage === "pickup" ? "mt-0.5 h-4 w-4 text-emerald-600" : "mt-0.5 h-4 w-4 text-rose-600"} />
            <span className="flex-1 font-medium">
              {centerLoading ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching location…
                </span>
              ) : centerAddress || "Move the map to choose"}
            </span>
          </div>
          <button
            disabled={!centerAddress || centerLoading}
            onClick={confirmCurrent}
            className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {stage === "pickup" ? "Confirm Pickup" : "Confirm Drop"}
          </button>
        </div>
      ) : (
        <div className="border-t border-border bg-card p-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          {/* Route stats */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {routeLoading ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating route…</span>
            ) : routeInfo ? (
              <>
                <span className="font-semibold text-foreground">{routeInfo.distanceKm.toFixed(1)} km</span>
                <span>•</span>
                <span>{routeInfo.durationMin} min</span>
              </>
            ) : null}
          </div>

          {showAllVehicles ? (
            <div className="mt-2 space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {(["sedan", "suv"] as const).map((id) => (
                <VehicleCard
                  key={id}
                  type={id}
                  fare={routeInfo ? (id === "sedan" ? fares.sedan : fares.suv) : 0}
                  selected={vehicle === id}
                  onSelect={() => setVehicle(id)}
                />
              ))}
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([
                { id: "sedan" as const, label: "Sedan", img: sedanImg, seats: 4, fare: fares.sedan },
                { id: "suv" as const, label: "SUV", img: suvImg, seats: 7, fare: fares.suv },
              ]).map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVehicle(v.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-2xl border-2 bg-card p-2 text-center",
                    vehicle === v.id ? "border-primary" : "border-border"
                  )}
                >
                  <img src={v.img} alt={v.label} className="h-12 w-20 object-contain" />
                  <div className="text-sm font-bold">{v.label}</div>
                  <div className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Users className="h-3 w-3" /> {v.seats}
                  </div>
                  <div className="text-sm font-extrabold text-primary">
                    {routeInfo ? formatINR(v.fare) : "—"}
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowAllVehicles((v) => !v)}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft/40"
          >
            {showAllVehicles ? "Show less" : "View all vehicles"}
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showAllVehicles && "rotate-90")} />
          </button>

          <button
            disabled={!routeInfo}
            onClick={handleBookNow}
            className="mt-3 w-full rounded-xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow-lg disabled:opacity-50"
          >
            Book Now {routeInfo ? `· ${formatINR(vehicle === "sedan" ? fares.sedan : fares.suv)}` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
