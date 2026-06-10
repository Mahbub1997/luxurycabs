import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not an admin");
}

/** Bootstrap: claim admin role if there is no admin yet. Caller must be authenticated. */
export const claimFirstAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: cErr } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (cErr) throw new Error(cErr.message);
    if ((count ?? 0) > 0) throw new Error("An admin already exists");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    const { count } = await supabaseAdmin
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    return { isAdmin: !!data, anyAdmin: (count ?? 0) > 0 };
  });

/** Admin creates a driver account (auth user + drivers row + driver role). */
export const createDriverAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      email: z.string().email(),
      password: z.string().min(6).max(72),
      name: z.string().min(1).max(120),
      phone: z.string().min(7).max(20),
      vehicle_type: z.string().min(1).max(40),
      vehicle_model: z.string().max(120).optional(),
      vehicle_number: z.string().max(40).optional(),
      license_number: z.string().max(60).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
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
      vehicle_type: data.vehicle_type,
      vehicle_model: data.vehicle_model ?? null,
      vehicle_number: data.vehicle_number ?? null,
      license_number: data.license_number ?? null,
      status: "approved",
    });
    if (dErr) throw new Error(dErr.message);
    return { ok: true, user_id: uid };
  });

export const updateDriverStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      driver_id: z.string().uuid(),
      status: z.enum(["pending", "approved", "suspended", "rejected"]),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("drivers")
      .update({ status: data.status })
      .eq("id", data.driver_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const decideWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      request_id: z.string().uuid(),
      approve: z.boolean(),
      note: z.string().max(500).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: req, error: rErr } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("*")
      .eq("id", data.request_id)
      .single();
    if (rErr) throw new Error(rErr.message);
    if (req.status !== "pending") throw new Error("Already decided");

    if (!data.approve) {
      const { error } = await supabaseAdmin
        .from("withdrawal_requests")
        .update({
          status: "rejected",
          decided_by: context.userId,
          decided_at: new Date().toISOString(),
          note: data.note ?? null,
        })
        .eq("id", data.request_id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const { data: driver } = await supabaseAdmin
      .from("drivers")
      .select("wallet_balance")
      .eq("id", req.driver_id)
      .single();
    const newBal = Number(driver?.wallet_balance ?? 0) - Number(req.amount);
    const { error: wErr } = await supabaseAdmin
      .from("drivers")
      .update({ wallet_balance: newBal })
      .eq("id", req.driver_id);
    if (wErr) throw new Error(wErr.message);

    await supabaseAdmin.from("wallet_transactions").insert({
      driver_id: req.driver_id,
      type: "withdrawal",
      amount: -Number(req.amount),
      balance_after: newBal,
      note: data.note ?? "Withdrawal approved",
    });
    const { error: uErr } = await supabaseAdmin
      .from("withdrawal_requests")
      .update({
        status: "approved",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        note: data.note ?? null,
      })
      .eq("id", data.request_id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true, balance: newBal };
  });

export const upsertFare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid().optional(),
      trip_type: z.string().min(1).max(40),
      vehicle_type: z.string().min(1).max(40),
      base_fare: z.number().min(0),
      per_km: z.number().min(0),
      per_min: z.number().min(0),
      minimum_fare: z.number().min(0),
      outstation_per_km: z.number().min(0),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("fare_config")
        .update({
          trip_type: data.trip_type,
          vehicle_type: data.vehicle_type,
          base_fare: data.base_fare,
          per_km: data.per_km,
          per_min: data.per_min,
          minimum_fare: data.minimum_fare,
          outstation_per_km: data.outstation_per_km,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("fare_config").insert({
        trip_type: data.trip_type,
        vehicle_type: data.vehicle_type,
        base_fare: data.base_fare,
        per_km: data.per_km,
        per_min: data.per_min,
        minimum_fare: data.minimum_fare,
        outstation_per_km: data.outstation_per_km,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/** Admin gets signed URLs for a driver's docs (selfie/license). */
export const getDriverDocUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ driver_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: drv, error } = await supabaseAdmin
      .from("drivers")
      .select("selfie_url, license_photo_url")
      .eq("id", data.driver_id)
      .single();
    if (error) throw new Error(error.message);
    async function sign(path: string | null) {
      if (!path) return null;
      const { data: s } = await supabaseAdmin.storage.from("driver-docs").createSignedUrl(path, 60 * 30);
      return s?.signedUrl ?? null;
    }
    return {
      selfie: await sign(drv.selfie_url),
      license: await sign(drv.license_photo_url),
    };
  });

/** List approved drivers (for assigning bookings). */
export const listApprovedDrivers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("drivers")
      .select("id, name, phone, vehicle_type, vehicle_model, vehicle_number, is_online")
      .eq("status", "approved")
      .order("is_online", { ascending: false })
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

