import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const reverseGeocode = createServerFn({ method: "POST" })
  .inputValidator(z.object({ lat: z.number(), lng: z.number() }))
  .handler(async ({ data }) => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!lovableKey || !mapsKey) throw new Error("Missing Maps credentials");

    const url = `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?latlng=${data.lat},${data.lng}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": mapsKey,
      },
    });
    if (!res.ok) throw new Error(`Geocode ${res.status}`);
    const json = (await res.json()) as {
      results?: Array<{ formatted_address: string; types?: string[] }>;
    };
    const results = json.results ?? [];
    const pick =
      results.find((r) => r.types?.some((t) => ["street_address", "premise"].includes(t))) ??
      results.find((r) => r.types?.some((t) => ["route", "sublocality", "neighborhood"].includes(t))) ??
      results.find((r) => r.types?.includes("locality")) ??
      results[0];
    return { address: pick?.formatted_address ?? "" };
  });
