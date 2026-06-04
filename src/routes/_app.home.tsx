import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, ChevronRight, MapPin, Shield, Clock, Sparkles } from "lucide-react";
import { BrandHeader } from "@/components/Brand";

export const Route = createFileRoute("/_app/home")({
  head: () => ({ meta: [{ title: "Home — Luxury Cabs" }] }),
  component: Home,
});

function Home() {
  return (
    <div className="flex flex-col gap-5 pb-6">
      <BrandHeader right={<Bell className="h-5 w-5 text-foreground" />} />

      <section className="mx-4 overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-primary-foreground shadow-lg">
        <div className="text-xs font-semibold tracking-wider opacity-80">WELCOME BACK</div>
        <h2 className="mt-1 font-display text-2xl font-bold leading-tight">
          Where would you<br />like to go today?
        </h2>
        <Link
          to="/booking"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary shadow"
        >
          Book a Ride <ChevronRight className="h-4 w-4" />
        </Link>
      </section>

      <section className="mx-4">
        <div className="text-sm font-semibold">Quick Book</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { label: "Local", mode: "local" as const },
            { label: "Outstation", mode: "outstation" as const },
            { label: "Rental", mode: "rental" as const },
          ].map((q) => (
            <Link
              key={q.mode}
              to="/booking"
              search={{ tab: q.mode }}
              className="rounded-xl border border-border bg-card p-3 text-center text-sm font-medium hover:border-primary"
            >
              <MapPin className="mx-auto mb-1 h-5 w-5 text-primary" />
              {q.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-4">
        <div className="text-sm font-semibold">Why Luxury Cabs</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { I: Shield, t: "100% Safe", s: "Verified drivers" },
            { I: Clock, t: "On Time", s: "Always punctual" },
            { I: Sparkles, t: "Premium", s: "Top vehicles" },
          ].map(({ I, t, s }) => (
            <div key={t} className="rounded-xl border border-border bg-card p-3 text-center">
              <I className="mx-auto h-5 w-5 text-primary" />
              <div className="mt-1 text-[13px] font-semibold">{t}</div>
              <div className="text-[10px] text-muted-foreground">{s}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
