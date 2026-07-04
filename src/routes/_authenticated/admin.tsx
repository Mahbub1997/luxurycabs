import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { ClipboardList, Users, LogOut, UserCheck, Activity, Map as MapIcon, UserCircle2, ShieldPlus, FileText, IndianRupee } from "lucide-react";
import { CredoomWordmark } from "@/components/Brand";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/NotificationBell";
import { notify } from "@/lib/notify";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminShell,
});

function AdminShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const mountedRef = useRef(false);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  // Ringtone + notification when a NEW booking is created. Fires anywhere in
  // the admin panel — plays a ~5s ringtone loop and shows a toast/browser alert.
  useEffect(() => {
    // Skip the very first mount tick to avoid firing on initial replay.
    mountedRef.current = true;
    const ch = supabase
      .channel("admin-new-booking-alert")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (p) => {
          if (!mountedRef.current) return;
          const row: any = p.new;
          void ringFor(5000);
          notify("New booking 🚕", `${row.customer_name ?? "Customer"} — ${row.pickup_address ?? ""} → ${row.drop_address ?? ""}`);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);


  const tabs = [
    { to: "/admin/bookings", label: "Bookings", Icon: ClipboardList },
    { to: "/admin/live", label: "Live Trips", Icon: Activity },
    { to: "/admin/drivers-map", label: "Live Map", Icon: MapIcon },
    { to: "/admin/pricing", label: "Pricing", Icon: IndianRupee },
    { to: "/admin/invoices", label: "Invoices", Icon: FileText },
    { to: "/admin/approvals", label: "Approvals", Icon: UserCheck },
    { to: "/admin/drivers", label: "Drivers", Icon: Users },
    { to: "/admin/customers", label: "Customers", Icon: UserCircle2 },
    { to: "/admin/add-admin", label: "Add Admin", Icon: ShieldPlus },
  ];



  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-primary">
          <CredoomWordmark label="Luxury Cabs Admin" />
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell iconClassName="text-muted-foreground" />
          <button onClick={signOut} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </header>
      <nav className="sticky top-[49px] z-10 flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2">
        {tabs.map(({ to, label, Icon }) => {
          const active = path.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}

/** Play a repeating 2-tone ringtone for `durationMs` (default 5s) + vibrate. */
async function ringFor(durationMs = 5000) {
  if (typeof window === "undefined") return;
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const end = ctx.currentTime + durationMs / 1000;
    let t = ctx.currentTime;
    while (t < end) {
      for (const f of [880, 660]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + 0.4);
        t += 0.45;
      }
      t += 0.35;
    }
    try { if ("vibrate" in navigator) (navigator as any).vibrate([500, 200, 500, 200, 500]); } catch {}
    setTimeout(() => { try { ctx.close(); } catch {} }, durationMs + 500);
  } catch {}
}
