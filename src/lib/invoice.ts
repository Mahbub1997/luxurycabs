import jsPDF from "jspdf";
import type { Booking } from "@/lib/booking-store";
import { formatINR, fareBreakdown, tariffFor } from "@/lib/fare";

export function generateInvoice(b: Booking) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  let y = M;

  // Header bar
  doc.setFillColor(31, 111, 63);
  doc.rect(0, 0, W, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("LUXURY CABS", M, 45);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Comfort · Class · Every Ride", M, 62);
  doc.setFontSize(11);
  doc.text("INVOICE", W - M, 45, { align: "right" });
  doc.text(`#${b.id.slice(0, 8).toUpperCase()}`, W - M, 62, { align: "right" });

  y = 120;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Trip Details", M, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const rows: [string, string][] = [
    ["Booking ID", b.id],
    ["Date", new Date(b.completed_at ?? b.scheduled_at).toLocaleString("en-IN")],
    ["Trip Type", `${b.trip_type.toUpperCase()}${b.trip_mode ? " · " + b.trip_mode : ""}`],
    ["Vehicle", `${tariffFor(b.vehicle_type as "sedan" | "suv").label}${b.vehicle_model ? " — " + b.vehicle_model : ""}`],
    ["Vehicle No.", b.vehicle_number ?? "—"],
    ["Driver", `${b.driver_name ?? "—"} (${b.driver_phone ?? "—"})`],
    ["Pickup", b.pickup_address],
    ["Drop", b.drop_address],
    ["Distance", `${Number(b.distance_km).toFixed(2)} km`],
    ["Duration", `${b.duration_min} min`],
  ];
  rows.forEach(([k, v]) => {
    doc.setTextColor(110, 110, 110);
    doc.text(k, M, y);
    doc.setTextColor(20, 20, 20);
    const lines = doc.splitTextToSize(String(v), W - M - 150);
    doc.text(lines, M + 110, y);
    y += 14 * lines.length;
  });

  y += 10;
  doc.setDrawColor(220);
  doc.line(M, y, W - M, y);
  y += 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Fare Breakdown", M, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const fb = fareBreakdown(b.vehicle_type as "sedan" | "suv", Number(b.distance_km), b.duration_min);
  const items: [string, number][] = [
    ["Base fare", fb.base],
    ["Distance charge", fb.distance],
    ["Time charge", fb.time],
    ["Taxes & fees", fb.taxes],
  ];
  items.forEach(([k, v]) => {
    doc.setTextColor(80);
    doc.text(k, M, y);
    doc.text(formatINR(v), W - M, y, { align: "right" });
    y += 14;
  });

  y += 6;
  doc.setDrawColor(180);
  doc.line(M, y, W - M, y);
  y += 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(31, 111, 63);
  doc.text("Total Paid", M, y);
  doc.text(formatINR(Number(b.fare)), W - M, y, { align: "right" });

  y += 30;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Payment Method: ${b.payment_method.toUpperCase()}`, M, y);
  y += 14;
  doc.text("Thank you for riding with Luxury Cabs.", M, y);

  doc.save(`LuxuryCabs-${b.id.slice(0, 8)}.pdf`);
}
