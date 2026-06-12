import { createFileRoute, Outlet, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { ClipboardList, Users, LogOut } from "lucide-react";
import { CredoomWordmark } from "@/components/Brand";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminShell,
});

function AdminShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  }

  const tabs = [
    { to: "/admin/bookings", label: "Bookings", Icon: ClipboardList },
    { to: "/admin/drivers", label: "Drivers", Icon: Users },
    { to: "/admin/fares", label: "Fares", Icon: IndianRupee },
    { to: "/admin/local-fares", label: "Local Drop", Icon: MapPin },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-primary">
          <CredoomWordmark label="Luxury Cabs Admin" />
        </div>
        <button onClick={signOut} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
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
