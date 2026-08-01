import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Place = z.object({
  address: z.string().min(1).max(500),
  lat: z.number(),
  lng: z.number(),
});

/**
 * Creates a booking with a SERVER-COMPUTED fare.
 * The browser never supplies price, distance, duration or tolls.
 */
export const createBookingSecure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tripType: z.enum(["local", "outstation", "rental"]),
        vehicleType: z.enum(["sedan", "suv"]),
        vehicleModel: z.string().max(120).nullish(),
        packageCode: z.string().max(60).nullish(),
        outstationVehicleCode: z.string().max(60).nullish(),
        days: z.number().int().min(1).max(60).optional(),
        pickup: Place,
        drop: Place.nullish(),
        scheduledAt: z.string().min(1),
        customerName: z.string().max(120).nullish(),
        customerPhone: z.string().max(30).nullish(),
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const { computeRouteServer, loadPricing, quoteFare } = await import("@/lib/booking.server");

    const needsRoute = data.tripType !== "rental";
    if (needsRoute && !data.drop) throw new Error("Drop location required");

    const [pricing, route] = await Promise.all([
      loadPricing(context.supabase as any),
      needsRoute ? computeRouteServer(data.pickup, data.drop!) : Promise.resolve(null),
    ]);

    const quote = quoteFare(
      {
        tripType: data.tripType,
        vehicleType: data.vehicleType,
        vehicleModel: data.vehicleModel ?? null,
        packageCode: data.packageCode ?? null,
        outstationVehicleCode: data.outstationVehicleCode ?? null,
        days: data.days,
      },
      pricing,
      route
    );

    const scheduled = new Date(data.scheduledAt);
    if (Number.isNaN(scheduled.getTime())) throw new Error("Invalid pickup time");

    const { data: booking, error } = await context.supabase
      .from("bookings")
      .insert({
        user_id: context.userId,
        trip_type: data.tripType,
        trip_mode: data.tripType === "outstation" ? "round" : null,
        package_label: quote.packageLabel,
        pickup_address: data.pickup.address,
        pickup_lat: data.pickup.lat,
        pickup_lng: data.pickup.lng,
        drop_address: data.drop?.address ?? data.pickup.address,
        drop_lat: data.drop?.lat ?? data.pickup.lat,
        drop_lng: data.drop?.lng ?? data.pickup.lng,
        scheduled_at: scheduled.toISOString(),
        vehicle_type: quote.vehicleType,
        vehicle_model: quote.vehicleModel,
        distance_km: quote.distanceKm,
        duration_min: quote.durationMin,
        fare: quote.fare,
        tolls: quote.tolls,
        route_polyline: quote.polyline,
        customer_name: data.customerName ?? null,
        customer_phone: data.customerPhone ?? null,
        payment_method: "",
        payment_status: "pending",
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return booking;
  });
