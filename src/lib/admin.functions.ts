import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Fixed email used for the main "luxury cabs" account. */
export const MAIN_ADMIN_EMAIL = "luxurycabs@admin.local";
const MAIN_ADMIN_PASSWORD = "5678";

async function assertSuperAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .eq("approved", true)
    .maybeSingle();
  if (!data) throw new Error("Super admin only");
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role, approved")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"])
    .eq("approved", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Not an approved admin");
}

/** Bootstrap the main admin (luxury cabs / 5678). Idempotent. Public — guarded by password. */
export const ensureMainAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ password: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    if (data.password !== MAIN_ADMIN_PASSWORD) {
      throw new Error("Invalid main admin password");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let user = list?.users.find((u) => u.email?.toLowerCase() === MAIN_ADMIN_EMAIL);
    if (!user) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: MAIN_ADMIN_EMAIL,
        password: MAIN_ADMIN_PASSWORD,
        email_confirm: true,
        user_metadata: { name: "Luxury Cabs", role: "super_admin" },
      });
      if (created.error) throw new Error(created.error.message);
      user = created.data.user!;
    }
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user!.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) {
      await supabaseAdmin.from("user_roles").insert({
        user_id: user!.id,
        role: "super_admin",
        approved: true,
        approved_at: new Date().toISOString(),
        approved_by: user!.id,
      });
    }
    return { ok: true, email: MAIN_ADMIN_EMAIL };
  });

/** New admin signup creates a PENDING admin row awaiting super-admin approval. */
export const requestAdminAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("user_roles")
      .select("id, approved, role")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    if (existing) return { ok: true, approved: !!existing.approved };
    const { error } = await supabaseAdmin.from("user_roles").insert({
      user_id: context.userId,
      role: "admin",
      approved: false,
    });
    if (error) throw new Error(error.message);
    return { ok: true, approved: false };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role, approved")
      .eq("user_id", context.userId)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    return {
      isAdmin: !!data && !!data.approved,
      isSuperAdmin: data?.role === "super_admin" && !!data.approved,
      pending: !!data && !data.approved,
    };
  });

export const listPendingAdmins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("user_roles")
      .select("id, user_id, requested_at")
      .eq("role", "admin")
      .eq("approved", false)
      .order("requested_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const byId = new Map((list?.users ?? []).map((u) => [u.id, u]));
    return (rows ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      requested_at: r.requested_at,
      email: byId.get(r.user_id)?.email ?? "—",
    }));
  });

export const decideAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ role_id: z.string().uuid(), approve: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.approve) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .update({
          approved: true,
          approved_at: new Date().toISOString(),
          approved_by: context.userId,
        })
        .eq("id", data.role_id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("user_roles").delete().eq("id", data.role_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
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

