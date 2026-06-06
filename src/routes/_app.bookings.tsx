import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandHeader } from "@/components/Brand";
import { CalendarCheck, ChevronRight, MapPin } from "lucide-react";
import { getRecentBookingIds, getBooking, type Booking } from "@/lib/booking-store";
import { formatINR } from "@/lib/fare";

export const Route = createFileRoute("/_app/bookings")({
  head: () => ({ meta: [{ title: "My Bookings — Luxury Cabs" }] }),
  component: Bookings,
});

function Bookings() {
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const ids = getRecentBookingIds();
        const rows = await Promise.all(ids.map((id) => getBooking(id).catch(() => null)));
        setItems(rows.filter(Boolean) as Booking[]);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="flex flex-col pb-24">
      <BrandHeader />
      <div className="mx-4 mt-3 text-sm font-semibold">My Bookings</div>
      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft">
            <CalendarCheck className="h-7 w-7 text-primary" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold">No bookings yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your trip history will appear here.</p>
          <Link to="/booking" className="mt-4 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Book a ride</Link>
        </div>
      ) : (
        <div className="mx-4 mt-2 space-y-2">
          {items.map((b) => {
            const target = b.status === "completed" ? ({ to: "/complete/$id", params: { id: b.id } } as const) : ({ to: "/track/$id", params: { id: b.id } } as const);
            return (
              <Link key={b.id} {...target} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft text-primary">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{b.drop_address}</div>
                  <div className="truncate text-xs text-muted-foreground">{b.trip_type.toUpperCase()} · {b.vehicle_type.toUpperCase()} · {formatINR(Number(b.fare))}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
