import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, Star, Home as HomeIcon, Loader2, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { getBooking, type Booking } from "@/lib/booking-store";
import { formatINR, fareBreakdown, tariffFor, OUTSTATION_VEHICLES, calcOutstationBreakdown } from "@/lib/fare";
import { generateInvoice } from "@/lib/invoice";
import { uploadInvoiceFor } from "@/lib/invoice-storage";

import { formatDuration } from "@/lib/utils";

export const Route = createFileRoute("/complete/$id")({
  head: () => ({ meta: [{ title: "Trip Complete — Luxury Cabs" }] }),
  component: Complete,
});

function Complete() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [b, setB] = useState<Booking | null>(null);
  const [rating, setRating] = useState(5);

  useEffect(() => { getBooking(id).then(setB); }, [id]);

  // Auto-generate and store the invoice once we have the booking and it isn't already saved.
  useEffect(() => {
    if (!b) return;
    const anyB = b as any;
    if (anyB.invoice_path) return;
    if (b.status !== "completed") return;
    uploadInvoiceFor(b).catch((err) => console.error("invoice upload failed", err));
  }, [b]);


  if (!b) {
    return <div className="app-shell grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const isOutstation = b.trip_type === "outstation";
  const fb = fareBreakdown(b.vehicle_type as "sedan" | "suv", Number(b.distance_km), b.duration_min);
  const outV = OUTSTATION_VEHICLES.find(v => v.tier === (b.vehicle_type as "sedan" | "suv")) ?? OUTSTATION_VEHICLES[0];
  const outBd = isOutstation ? calcOutstationBreakdown(outV, { distanceKm: Number(b.distance_km), days: 1 }) : null;

  const tariff = tariffFor(b.vehicle_type as "sedan" | "suv");

  return (
    <div className="app-shell flex flex-col bg-gradient-to-b from-primary-soft/30 to-background pb-8">
      <motion.div
        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 18 }}
        className="mx-auto mt-10 grid h-24 w-24 place-items-center rounded-full bg-primary text-primary-foreground shadow-xl"
      >
        <CheckCircle2 className="h-12 w-12" />
      </motion.div>
      <div className="mt-4 px-6 text-center">
        <h1 className="font-display text-3xl font-bold text-primary">Trip Completed</h1>
        <p className="mt-1 text-sm text-muted-foreground">Hope you had a comfortable ride.</p>
      </div>

      <div className="mx-4 mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <img src={b.driver_photo ?? ""} alt="" className="h-12 w-12 rounded-full object-cover" />
          <div className="flex-1">
            <div className="font-bold">{b.driver_name}</div>
            <div className="text-xs text-muted-foreground">{b.vehicle_model} · {b.vehicle_number}</div>
          </div>
        </div>
        <div className="mt-3 text-center text-xs font-semibold text-foreground/80">Rate your driver</div>
        <div className="mt-1 flex justify-center gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)}>
              <Star className={n <= rating ? "h-7 w-7 fill-yellow-500 text-yellow-500" : "h-7 w-7 text-muted-foreground"} />
            </button>
          ))}
        </div>
      </div>

      <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Trip Summary</div>
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
            <div className="flex-1 text-foreground">{b.pickup_address}</div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-destructive" />
            <div className="flex-1 text-foreground">{b.drop_address}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-xs">
          <span>{tariff.label} · {b.trip_type}</span>
          <span>{Number(b.distance_km).toFixed(1)} km · {formatDuration(b.duration_min)}</span>
        </div>
      </div>

      <div className="mx-4 mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="text-sm font-semibold">Fare Breakdown</div>
        <div className="mt-2 space-y-1 text-sm">
          <Row k="Base fare" v={formatINR(fb.base)} />
          <Row k="Distance" v={formatINR(fb.distance)} />
          <Row k="Time" v={formatINR(fb.time)} />
          <Row k="Taxes & fees" v={formatINR(fb.taxes)} />
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="font-bold">Total Paid</span>
          <span className="text-xl font-bold text-primary">{formatINR(Number(b.fare))}</span>
        </div>
        <div className="mt-1 text-right text-xs text-muted-foreground">via {b.payment_method.toUpperCase()}</div>
      </div>

      <div className="mx-4 mt-6 flex flex-col gap-2">
        <button
          onClick={() => generateInvoice(b)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-bold text-primary-foreground shadow"
        >
          <Download className="h-4 w-4" /> Download Invoice
        </button>
        <button
          onClick={() => navigate({ to: "/booking" })}
          className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-bold"
        >
          <HomeIcon className="h-4 w-4" /> Back to Home
        </button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}
