import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LatLng = z.object({ lat: z.number(), lng: z.number() });

export const computeRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ origin: LatLng, destination: LatLng }))
  .handler(async ({ data }) => {
    const { computeRouteServer } = await import("@/lib/booking.server");
    return computeRouteServer(data.origin, data.destination);
  });
