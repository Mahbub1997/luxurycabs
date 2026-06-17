import { useEffect, useRef, useState } from "react";
import { Bell, Inbox } from "lucide-react";
import { getAlerts, getUnreadCount, markAlertsRead, type AppAlert } from "@/lib/notify";

interface Props {
  /** Tailwind text color for the bell icon. */
  iconClassName?: string;
}

export function NotificationBell({ iconClassName = "text-foreground" }: Props) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AppAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => { setAlerts(getAlerts()); setUnread(getUnreadCount()); };
    refresh();
    window.addEventListener("luxury-alerts-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("luxury-alerts-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) { markAlertsRead(); setUnread(0); }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-muted"
      >
        <Bell className={`h-5 w-5 ${iconClassName}`} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-card">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-[300px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-top-2">
          <div className="border-b border-border px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Notifications
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <Inbox className="h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : alerts.slice(0, 30).map((a) => (
              <div key={a.id} className="border-b border-border/60 px-3 py-2 last:border-b-0">
                <div className="text-xs font-bold">{a.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{a.body}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
