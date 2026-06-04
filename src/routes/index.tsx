import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { CrownCarLogo } from "@/components/Brand";
import { Shield, UserCog, Clock } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Luxury Cabs — Comfort. Class. Every Ride." },
      { name: "description", content: "Premium cab booking — local, outstation and rentals with safe verified drivers." },
    ],
  }),
  component: Splash,
});

function Splash() {
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => navigate({ to: "/home" }), 5000);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="app-shell flex flex-col items-center justify-between bg-gradient-to-b from-primary-soft/40 via-background to-background py-12">
      <div className="h-8" />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7 }}
        className="flex flex-col items-center px-6 text-center"
      >
        <CrownCarLogo className="h-20 w-20" />
        <h1 className="mt-4 font-display text-5xl font-bold leading-none tracking-tight text-primary">
          LUXURY
        </h1>
        <div className="mt-1 flex items-center gap-3 text-foreground/80">
          <span className="h-px w-8 bg-foreground/40" />
          <span className="font-display text-2xl tracking-[0.4em]">CABS</span>
          <span className="h-px w-8 bg-foreground/40" />
        </div>
        <p className="mt-3 text-xs font-medium tracking-[0.3em] text-muted-foreground">
          COMFORT · CLASS · EVERY RIDE
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="grid w-full max-w-xs grid-cols-3 gap-3 px-6 text-center text-[11px] font-semibold tracking-wide text-foreground/70"
      >
        {[
          { I: Shield, l: "SAFE" },
          { I: UserCog, l: "VERIFIED DRIVER" },
          { I: Clock, l: "ON TIME" },
        ].map(({ I, l }, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <I className="h-6 w-6 text-primary" strokeWidth={1.6} />
            <span>{l}</span>
          </div>
        ))}
      </motion.div>

      <div className="h-3 w-32 overflow-hidden rounded-full bg-primary-soft">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          transition={{ duration: 5, ease: "linear" }}
          className="h-full bg-primary"
        />
      </div>
    </div>
  );
}
