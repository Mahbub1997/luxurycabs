import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandHeader } from "@/components/Brand";
import { Bell, Inbox } from "lucide-react";
import { getAlerts, markAlertsRead, type AppAlert } from "@/lib/notify";

export const Route = createFileRoute("/_app/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Luxury Cabs" }] }),
  component: Notifications,
});

function Notifications() {
  const [alerts, setAlerts] = useState<AppAlert[]>([]);

  useEffect(() => {
    const load = () => setAlerts(getAlerts());
    load();
    markAlertsRead();
    window.addEventListener("luxury-alerts-updated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("luxury-alerts-updated", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  return (
    <div className="flex flex-col pb-24">
      <BrandHeader />
      <div className="mx-4 mt-3 text-sm font-semibold">Alerts</div>
      {alerts.length === 0 ? <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft">
          <Inbox className="h-7 w-7 text-primary" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold">No notifications yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You'll see ride updates, offers and trip receipts here.
        </p>
      </div> : <div className="mx-4 mt-2 space-y-2">
        {alerts.map((a) => (
          <div key={a.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{a.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{a.body}</div>
              <div className="mt-1 text-[10px] font-medium text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}
