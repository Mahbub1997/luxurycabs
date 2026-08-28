import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import splashAsset from "@/assets/luxury-cabs-splash.png.asset.json";
import { getProfile } from "@/lib/profile";
import { findActiveBookingId } from "@/lib/booking-store";
import { AppDrawer } from "@/components/AppDrawer";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Luxury Cabs — Comfort. Class. Every Ride." },
      { name: "description", content: "Premium cab booking — local, outstation and rentals with safe verified drivers." },
    ],
  }),
  component: Splash,
});

const BRAND = "LUXURY CABS";

/** Never let a slow/offline backend keep the splash on screen. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<T>((res) => setTimeout(() => res(fallback), ms)),
  ]);
}

function Splash() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    const escapeSplash = window.setTimeout(() => {
      if (!cancelled && window.location.pathname === "/") {
        window.location.replace("/auth");
      }
    }, 7000);
    const t = setTimeout(async () => {
      const go = (to: any, params?: any) => {
        if (!cancelled) navigate(params ? { to, params, replace: true } : { to, replace: true });
      };
      try {
        const p = getProfile();
        const session = await withTimeout(
          supabase.auth.getSession().then(({ data }) => data.session),
          3000,
          null,
        );
        if (cancelled) return;
        if (!p || !session) { go("/auth"); return; }
        const activeId = await withTimeout(findActiveBookingId(), 4000, null);
        if (cancelled) return;
        if (activeId) go("/track/$id", { id: activeId });
        else go("/booking");
      } catch {
        go("/auth");
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearTimeout(t);
      clearTimeout(escapeSplash);
    };
  }, [navigate]);

  return (
    <div className="app-shell relative flex flex-col items-center justify-between overflow-hidden bg-white py-16">
      <AppDrawer />

      {/* Logo crown image */}
      <motion.img
        src={splashAsset.url}
        alt="Luxury Cabs"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 mt-6 w-[78%] max-w-xs object-contain"
      />

      {/* Letter-by-letter brand text (also visible in image, this is the typed animation overlay below) */}
      <div className="relative z-10 flex flex-col items-center gap-2">
        <div className="flex items-end justify-center">
          {BRAND.split("").map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 + i * 0.18, duration: 0.45, ease: "easeOut" }}
              className="text-3xl font-bold tracking-[0.18em] text-primary"
              style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {ch === " " ? "\u00A0" : ch}
            </motion.span>
          ))}
        </div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 + BRAND.length * 0.18 + 0.2, duration: 0.6 }}
          className="text-[10px] font-semibold tracking-[0.3em] text-primary/70"
        >
          PREMIUM RIDES · EXCEPTIONAL JOURNEYS
        </motion.p>
      </div>

      {/* Loading animation at bottom */}
      <div className="relative z-10 mb-2 flex flex-col items-center gap-3">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-2.5 w-2.5 rounded-full bg-primary"
              animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
            />
          ))}
        </div>
        <p className="text-xs font-semibold tracking-[0.25em] text-primary">
          PLEASE WAIT...
        </p>
      </div>
    </div>
  );
}
