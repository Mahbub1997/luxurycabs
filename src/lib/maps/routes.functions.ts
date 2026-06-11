import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const LatLng = z.object({ lat: z.number(), lng: z.number() });

export const computeRoute = createServerFn({ method: "POST" })
  .inputValidator(z.object({ origin: LatLng, destination: LatLng }))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !mapsKey) throw new Error("Missing Maps credentials");

    const res = await fetch(
      "https://connector-gateway.lovable.dev/google_maps/routes/directions/v2:computeRoutes",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": mapsKey,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.travelAdvisory.tollInfo",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: data.origin.lat, longitude: data.origin.lng } } },
          destination: { location: { latLng: { latitude: data.destination.lat, longitude: data.destination.lng } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          extraComputations: ["TOLLS"],
          routeModifiers: { vehicleInfo: { emissionType: "GASOLINE" } },
        }),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Routes API ${res.status}: ${t}`);
    }
    const json = (await res.json()) as {
      routes?: Array<{
        distanceMeters: number;
        duration: string;
        polyline: { encodedPolyline: string };
        travelAdvisory?: {
          tollInfo?: {
            estimatedPrice?: Array<{ currencyCode: string; units?: string; nanos?: number }>;
          };
        };
      }>;
    };
    const route = json.routes?.[0];
    if (!route) throw new Error("No route found");
    const seconds = Number(route.duration.replace("s", ""));
    let tollInr = 0;
    const prices = route.travelAdvisory?.tollInfo?.estimatedPrice ?? [];
    for (const p of prices) {
      const amt = Number(p.units ?? 0) + (p.nanos ?? 0) / 1e9;
      if (p.currencyCode === "INR") tollInr += amt;
      else if (p.currencyCode === "USD") tollInr += amt * 83;
      else tollInr += amt;
    }
    return {
      distanceKm: route.distanceMeters / 1000,
      durationMin: Math.round(seconds / 60),
      polyline: route.polyline.encodedPolyline,
      tollInr: Math.round(tollInr),
    };
  });
