import { createFileRoute, Link } from "@tanstack/react-router";
import { Car } from "lucide-react";

export const Route = createFileRoute("/driver/login")({
  head: () => ({ meta: [{ title: "Driver — Luxury Cabs" }] }),
  component: DriverLoginStub,
});

function DriverLoginStub() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-primary-soft/40 to-background px-6 text-center">
      <Car className="h-12 w-12 text-primary" />
      <h1 className="mt-4 font-display text-xl font-bold">Driver app coming soon</h1>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Admin can add drivers from the Admin → Drivers tab. The driver-facing app is the next step.
      </p>
      <Link to="/" className="mt-6 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
        Back to home
      </Link>
    </div>
  );
}
