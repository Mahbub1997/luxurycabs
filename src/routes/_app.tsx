import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { bookingCode, findActiveBookingId, getBooking, isActiveBookingMinimized, type Booking } from "@/lib/booking-store";
import { useSessionGuard } from "@/lib/session-guard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid && typeof window !== "undefined") {
        window.location.replace("/auth");
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!cancelled) setUserId(s?.user?.id ?? null);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  useSessionGuard("profiles", userId ? { column: "user_id", value: userId } : null, "/auth");

  useEffect(() => {
    let cancelled = false;
    async function loadMinimizedBooking() {
      const activeId = await findActiveBookingId();
      if (!activeId || !isActiveBookingMinimized(activeId)) {
        if (!cancelled) setActiveBooking(null);
        return;
      }
      const row = await getBooking(activeId).catch(() => null);
      if (!cancelled) setActiveBooking(row);
    }
    void loadMinimizedBooking();
    const onFocus = () => void loadMinimizedBooking();
    window.addEventListener("focus", onFocus);
    window.addEventListener("luxury-booking-minimized", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("luxury-booking-minimized", onFocus);
    };
  }, []);

  return (
    <div className="app-shell flex flex-col">
      <div className="flex-1 pb-2">
        <Outlet />
      </div>
      {activeBooking && (
        <Link
          to="/track/$id"
          params={{ id: activeBooking.id }}
          className="fixed bottom-20 right-[calc(50%-232px)] z-40 flex max-w-[190px] items-center gap-2 rounded-full border border-primary/30 bg-card px-3 py-2 shadow-xl ring-1 ring-border max-[480px]:right-4"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground">
            {(activeBooking.customer_name || bookingCode(activeBooking.id)).slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-xs font-bold">{bookingCode(activeBooking.id)}</span>
            <span className="block truncate text-[10px] font-semibold text-primary">
              {activeBooking.status === "cancelled" ? "Booking cancelled" : activeBooking.driver_name ? "Live trip" : "Searching driver"}
            </span>
          </span>
        </Link>
      )}
      <BottomNav />
    </div>
  );
}
