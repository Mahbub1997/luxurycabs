import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { motion } from "framer-motion";
import splashImg from "@/assets/splash.jpg";
import { getProfile } from "@/lib/profile";
import { AppDrawer } from "@/components/AppDrawer";

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
    const t = setTimeout(() => {
      const p = getProfile();
      navigate({ to: p ? "/booking" : "/auth", replace: true });
    }, 4000);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="app-shell relative flex flex-col items-center justify-end overflow-hidden bg-white">
      <AppDrawer />
      <img
        src={splashImg}
        alt="Luxury Cabs"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="relative z-10 mb-32 flex flex-col items-center gap-3"
      >
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
      </motion.div>
    </div>
  );
}
