import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type BookingInsert = Database["public"]["Tables"]["bookings"]["Insert"];

export async function createBooking(input: BookingInsert): Promise<Booking> {
  const { data, error } = await supabase.from("bookings").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function getBooking(id: string): Promise<Booking | null> {
  const { data, error } = await supabase.from("bookings").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateBooking(id: string, patch: Partial<Booking>) {
  const { data, error } = await supabase.from("bookings").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/** Short, shareable booking code derived from the uuid. */
export function bookingCode(id: string): string {
  const hex = id.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `LC${hex}`;
}

export const ACTIVE_BOOKING_STATUSES = [
  "pending",
  "driver_assigned",
  "driver_arrived",
  "in_progress",
] as const;

/**
 * Find the latest active (in-progress) booking for the current user, identified
 * by Supabase auth user_id when signed in, otherwise by the local profile phone.
 * Returns the booking id or null.
 */
export async function findActiveBookingId(): Promise<string | null> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;
    let phone: string | null = null;
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("luxury_user_profile");
        if (raw) phone = JSON.parse(raw)?.phone ?? null;
      } catch {}
    }
    if (!userId && !phone) return null;

    let q = supabase
      .from("bookings")
      .select("id")
      .in("status", [...ACTIVE_BOOKING_STATUSES])
      .order("created_at", { ascending: false })
      .limit(1);

    if (userId && phone) q = q.or(`user_id.eq.${userId},customer_phone.eq.${phone}`);
    else if (userId) q = q.eq("user_id", userId);
    else if (phone) q = q.eq("customer_phone", phone);

    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return data?.id ?? null;
  } catch {
    return null;
  }
}

const RECENT_KEY = "luxury_recent_booking_ids";
const MINIMIZED_ACTIVE_KEY = "luxury_minimized_active_booking";
export function pushRecentBooking(id: string) {
  if (typeof window === "undefined") return;
  const arr: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  const next = [id, ...arr.filter((x) => x !== id)].slice(0, 20);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}
export function getRecentBookingIds(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}

export function minimizeActiveBooking(id: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(MINIMIZED_ACTIVE_KEY, id);
}

export function clearMinimizedActiveBooking(id?: string) {
  if (typeof window === "undefined") return;
  if (!id || sessionStorage.getItem(MINIMIZED_ACTIVE_KEY) === id) {
    sessionStorage.removeItem(MINIMIZED_ACTIVE_KEY);
  }
}

export function isActiveBookingMinimized(id: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(MINIMIZED_ACTIVE_KEY) === id;
}
