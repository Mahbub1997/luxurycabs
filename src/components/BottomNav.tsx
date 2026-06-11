import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarCheck, Bell, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/booking", label: "Home", Icon: Home, match: (p: string) => p === "/booking" || p === "/" },
  { to: "/bookings", label: "Bookings", Icon: CalendarCheck, match: (p: string) => p.startsWith("/bookings") },
  { to: "/notifications", label: "Alerts", Icon: Bell, match: (p: string) => p.startsWith("/notifications") },
  { to: "/profile", label: "Profile", Icon: User, match: (p: string) => p.startsWith("/profile") },
] as const;

export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav data-app-chrome className="sticky bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {items.map(({ to, label, Icon, match }) => {
        const active = match(path);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
