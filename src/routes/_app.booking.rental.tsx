import { createFileRoute } from "@tanstack/react-router";
import { BookingPage } from "./_app.booking";

export const Route = createFileRoute("/_app/booking/rental")({
  head: () => ({ meta: [{ title: "Rental Booking — Luxury Cabs" }] }),
  component: () => <BookingPage forcedTab="rental" />,
});
