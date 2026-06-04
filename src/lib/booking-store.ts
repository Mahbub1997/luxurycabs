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

const RECENT_KEY = "luxury_recent_booking_ids";
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
