import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarCheck, Inbox, User } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getUnreadCount } from "@/lib/notify";

const items = [
  { to: "/booking", label: "Home", Icon: Home, match: (p: string) => p === "/booking" || p === "/" },
  { to: "/bookings", label: "Bookings", Icon: CalendarCheck, match: (p: string) => p.startsWith("/bookings") },
  { to: "/notifications", label: "Alerts", Icon: Inbox, match: (p: string) => p.startsWith("/notifications"), badge: true },
  { to: "/profile", label: "Profile", Icon: User, match: (p: string) => p.startsWith("/profile") },
] as const;

export function BottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const refresh = () => setUnread(getUnreadCount());
    refresh();
    window.addEventListener("luxury-alerts-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("luxury-alerts-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return (
    <nav data-app-chrome className="sticky bottom-0 z-30 grid grid-cols-4 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      {items.map(({ to, label, Icon, match, badge }) => {
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
            <span className="relative">
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
              {badge && unread > 0 && (
                <span className="absolute -right-2 -top-1.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-background">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
