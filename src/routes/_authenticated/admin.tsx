import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  const audioUnlockedRef = useRef(false);
  const pendingRingRef = useRef(false);
  const [approvalsCount, setApprovalsCount] = useState(0);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  // Browsers block AudioContext until a user gesture. Unlock on ANY click/tap
  // anywhere in the admin panel so subsequent booking alerts actually ring.
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      audioUnlockedRef.current = true;
      try {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctx) { const c = new Ctx(); c.resume?.().catch(() => {}); setTimeout(() => c.close?.().catch(() => {}), 200); }
      } catch {}
      // If an alert tried to ring before unlock, replay it now.
      if (pendingRingRef.current) { pendingRingRef.current = false; void ringFor(5000); }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Ringtone + notification when a NEW booking is created.
  useEffect(() => {
    mountedRef.current = true;
    const ch = supabase
      .channel("admin-new-booking-alert")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (p) => {
          if (!mountedRef.current) return;
          const row: any = p.new;
          if (audioUnlockedRef.current) void ringFor(5000);
          else pendingRingRef.current = true;
          notify("New booking 🚕", `${row.customer_name ?? "Customer"} — ${row.pickup_address ?? ""} → ${row.drop_address ?? ""}`);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Pending-approvals badge (drivers + withdrawals) with live updates.
  useEffect(() => {
    async function refresh() {
      const [d, w] = await Promise.all([
        supabase.from("drivers").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      setApprovalsCount((d.count ?? 0) + (w.count ?? 0));
    }
    refresh();
    const ch = supabase
      .channel("admin-approvals-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);


  const tabs = [
    { to: "/admin/bookings", label: "Bookings", Icon: ClipboardList },
    { to: "/admin/live", label: "Live Trips", Icon: Activity },
    { to: "/admin/drivers-map", label: "Live Map", Icon: MapIcon },
    { to: "/admin/pricing", label: "Pricing", Icon: IndianRupee },
    { to: "/admin/invoices", label: "Invoices", Icon: FileText },
    { to: "/admin/approvals", label: "Approvals", Icon: UserCheck, badge: approvalsCount },
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
