import { createFileRoute } from "@tanstack/react-router";
import { BrandHeader } from "@/components/Brand";
import { Inbox } from "lucide-react";

export const Route = createFileRoute("/_app/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Luxury Cabs" }] }),
  component: Notifications,
});

function Notifications() {
  return (
    <div className="flex flex-col">
      <BrandHeader />
      <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-primary-soft">
          <Inbox className="h-7 w-7 text-primary" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold">No notifications yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You'll see ride updates, offers and trip receipts here.
        </p>
      </div>
    </div>
  );
}
