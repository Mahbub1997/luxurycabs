import { createFileRoute } from "@tanstack/react-router";
import { BookingPage } from "./_app.booking";

export const Route = createFileRoute("/_app/booking/outstation")({
  head: () => ({ meta: [{ title: "Outstation Booking — Luxury Cabs" }] }),
  component: () => <BookingPage forcedTab="outstation" />,
});
