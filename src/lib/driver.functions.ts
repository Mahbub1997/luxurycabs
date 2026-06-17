import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Public signup for a new driver. Creates auth user + role + drivers row (pending).
 * Selfie / license photos are uploaded separately by the signed-in user.
 */
export const signupDriver = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(6).max(72),
      name: z.string().min(1).max(120),
      phone: z.string().min(7).max(20),
      license_number: z.string().min(1).max(60),
      vehicle_type: z.enum(["sedan", "suv"]).default("sedan"),
      vehicle_model: z.string().max(120).optional(),
      vehicle_number: z.string().max(40).optional(),
    }).parse(d)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const created = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, role: "driver" },
    });
    if (created.error) throw new Error(created.error.message);
    const uid = created.data.user!.id;

    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: "driver" });
    if (rErr) throw new Error(rErr.message);

    const { error: dErr } = await supabaseAdmin.from("drivers").insert({
      user_id: uid,
      name: data.name,
      phone: data.phone,
      email: data.email,
      license_number: data.license_number,
      vehicle_type: data.vehicle_type,
      vehicle_model: data.vehicle_model ?? null,
      vehicle_number: data.vehicle_number ?? null,
      status: "pending",
    } as any);
    if (dErr) throw new Error(dErr.message);
    return { ok: true, user_id: uid };
  });

/** Driver accepts a ride assigned to them — keeps status as driver_assigned. */
export const acceptRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ booking_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: drv } = await supabaseAdmin.from("drivers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!drv) throw new Error("No driver profile");
    const { error } = await supabaseAdmin
      .from("bookings")
      .update({ status: "driver_assigned" })
      .eq("id", data.booking_id)
      .eq("assigned_driver_id", drv.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Driver rejects assignment — clears assignment, back to pending. */
export const rejectRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ booking_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: drv } = await supabaseAdmin.from("drivers").select("id").eq("user_id", context.userId).maybeSingle();
    if (!drv) throw new Error("No driver profile");
    const { error } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "pending",
        assigned_driver_id: null,
        driver_name: null, driver_phone: null, driver_photo: null,
        driver_lat: null, driver_lng: null,
      })
      .eq("id", data.booking_id)
      .eq("assigned_driver_id", drv.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mark trip complete and credit wallet with 90% (10% commission). */
export const completeRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      booking_id: z.string().uuid(),
      payment_method: z.enum(["cash", "upi", "card"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: drv } = await supabaseAdmin
      .from("drivers").select("id, wallet_balance, total_trips").eq("user_id", context.userId).maybeSingle();
    if (!drv) throw new Error("No driver profile");

    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings").select("*").eq("id", data.booking_id).single();
    if (bErr) throw new Error(bErr.message);
    if (booking.assigned_driver_id !== drv.id) throw new Error("Not your booking");

    const fare = Number(booking.fare);
    const commission = Math.round(fare * 0.10 * 100) / 100;
    const credit = Math.round((fare - commission) * 100) / 100;
    const newBal = Math.round((Number(drv.wallet_balance) + credit - commission) * 100) / 100;
    // Note: drivers keep cash physically — wallet tracks platform owe.
    // To match user spec (1000 → wallet 900): we record net credit = fare - commission.
    const netBal = Math.round((Number(drv.wallet_balance) + (fare - commission)) * 100) / 100;

    const { error: uErr } = await supabaseAdmin
      .from("bookings")
      .update({
        status: "completed",
        payment_method: data.payment_method,
        payment_status: "paid",
        completed_at: new Date().toISOString(),
      })
      .eq("id", data.booking_id);
    if (uErr) throw new Error(uErr.message);

    await supabaseAdmin.from("drivers").update({
      wallet_balance: netBal,
      total_trips: (drv.total_trips ?? 0) + 1,
    }).eq("id", drv.id);

    await supabaseAdmin.from("wallet_transactions").insert([
      { driver_id: drv.id, type: "credit", amount: fare, balance_after: Number(drv.wallet_balance) + fare, booking_id: data.booking_id, note: `Trip earnings ${data.payment_method}` },
      { driver_id: drv.id, type: "commission", amount: -commission, balance_after: netBal, booking_id: data.booking_id, note: "Platform commission 10%" },
    ]);
    void newBal;
    return { ok: true, balance: netBal, credit, commission };
  });

/** Driver requests a withdrawal from wallet. */
export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      amount: z.number().min(1).max(1_000_000),
      note: z.string().max(300).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: drv } = await supabaseAdmin
      .from("drivers").select("id, wallet_balance").eq("user_id", context.userId).maybeSingle();
    if (!drv) throw new Error("No driver profile");
    if (Number(drv.wallet_balance) < data.amount) throw new Error("Insufficient balance");
    const { error } = await supabaseAdmin.from("withdrawal_requests").insert({
      driver_id: drv.id,
      amount: data.amount,
      note: data.note ?? null,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin manually assigns a booking to an approved driver. */
export const assignBookingToDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    booking_id: z.string().uuid(),
    driver_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isAdmin = await supabaseAdmin.from("user_roles")
      .select("role, approved")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"])
      .eq("approved", true)
      .maybeSingle();
    if (!isAdmin.data) throw new Error("Not admin");
    const { data: drv, error: dErr } = await supabaseAdmin
      .from("drivers")
      .select("id, name, phone, photo, selfie_url, vehicle_model, vehicle_number, rating, total_trips, current_lat, current_lng, status")
      .eq("id", data.driver_id).single();
    if (dErr) throw new Error(dErr.message);
    if (drv.status !== "approved") throw new Error("Driver not approved");

    // Resolve a displayable photo URL. Prefer drivers.photo if it's already
    // a full URL, otherwise sign the private selfie_url from driver-docs.
    let photoUrl: string | null = null;
    const raw = (drv as any).photo as string | null;
    if (raw && /^https?:\/\//i.test(raw)) {
      photoUrl = raw;
    } else if ((drv as any).selfie_url) {
      const { data: signed } = await supabaseAdmin
        .storage.from("driver-docs")
        .createSignedUrl((drv as any).selfie_url, 60 * 60 * 24 * 7);
      photoUrl = signed?.signedUrl ?? null;
    }

    const { error } = await supabaseAdmin.from("bookings").update({
      assigned_driver_id: drv.id,
      status: "driver_assigned",
      driver_name: drv.name,
      driver_phone: drv.phone,
      driver_photo: photoUrl,

      driver_rating: drv.rating,
      driver_trips: drv.total_trips,
      vehicle_model: drv.vehicle_model,
      vehicle_number: drv.vehicle_number,
      driver_lat: drv.current_lat,
      driver_lng: drv.current_lng,
    }).eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: hard-delete a driver (auth user + drivers row). Past bookings keep snapshot data. */
export const deleteDriverAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ driver_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isAdmin = await supabaseAdmin.from("user_roles")
      .select("role, approved")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"])
      .eq("approved", true)
      .maybeSingle();
    if (!isAdmin.data) throw new Error("Not admin");

    // Block delete if driver has any active booking.
    const { data: active } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("assigned_driver_id", data.driver_id)
      .in("status", ["driver_assigned", "driver_arrived", "in_progress"])
      .limit(1);
    if (active && active.length > 0) {
      throw new Error("Driver has an active trip — cannot delete. Please wait until the trip is complete or cancelled.");
    }

    const { data: drv, error: dErr } = await supabaseAdmin
      .from("drivers").select("user_id").eq("id", data.driver_id).maybeSingle();
    if (dErr) throw new Error(dErr.message);

    // Detach from past bookings (keeps snapshot of name/phone/vehicle).
    await supabaseAdmin.from("bookings")
      .update({ assigned_driver_id: null })
      .eq("assigned_driver_id", data.driver_id);

    // Delete child rows that reference driver_id.
    await supabaseAdmin.from("wallet_transactions").delete().eq("driver_id", data.driver_id);
    await supabaseAdmin.from("withdrawal_requests").delete().eq("driver_id", data.driver_id);

    const { error: rmErr } = await supabaseAdmin.from("drivers").delete().eq("id", data.driver_id);
    if (rmErr) throw new Error(rmErr.message);

    if (drv?.user_id) {
      // Remove role rows and auth user (ignore errors so a stuck auth row doesn't block).
      await supabaseAdmin.from("user_roles").delete().eq("user_id", drv.user_id);
      await supabaseAdmin.auth.admin.deleteUser(drv.user_id).catch(() => {});
    }
    return { ok: true };
  });

/** Admin or user: cancel a booking with a reason — accessible from any side. */
export const cancelBookingServer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    booking_id: z.string().uuid(),
    reason: z.string().trim().min(3).max(300),
    by: z.enum(["user", "admin", "driver"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Anyone authenticated can request cancel, but admin role required if by==='admin'.
    if (data.by === "admin") {
      const { data: ar } = await supabaseAdmin.from("user_roles")
        .select("approved").eq("user_id", context.userId)
        .in("role", ["admin", "super_admin"]).eq("approved", true).maybeSingle();
      if (!ar) throw new Error("Not admin");
    }
    const { error } = await supabaseAdmin.from("bookings").update({
      status: "cancelled",
      cancellation_reason: data.reason,
      cancelled_by: data.by,
    }).eq("id", data.booking_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
