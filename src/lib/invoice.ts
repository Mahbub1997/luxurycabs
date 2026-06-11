import jsPDF from "jspdf";
import type { Booking } from "@/lib/booking-store";
import { formatINR, fareBreakdown, OUTSTATION_VEHICLES, calcOutstationBreakdown, type VehicleType } from "@/lib/fare";

// Brand color (Luxury Cabs green)
const BRAND = { r: 22, g: 122, b: 56 };

function invoiceNumber(b: Booking) {
  const d = new Date(b.completed_at ?? b.scheduled_at);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const tail = b.id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `INV-${y}-${m}-${day}-${tail}`;
}
function bookingNumber(b: Booking) {
  const d = new Date(b.scheduled_at);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const tail = b.id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `BOOK-${y}-${m}-${day}-${tail}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function drawCrown(doc: jsPDF, x: number, y: number, size = 22) {
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  // Crown body
  const pts: Array<[number, number]> = [
    [x, y + size * 0.7],
    [x + size * 0.15, y + size * 0.25],
    [x + size * 0.32, y + size * 0.55],
    [x + size * 0.5, y + size * 0.15],
    [x + size * 0.68, y + size * 0.55],
    [x + size * 0.85, y + size * 0.25],
    [x + size, y + size * 0.7],
  ];
  doc.lines(pts.map((p, i) => i === 0 ? [0, 0] : [p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]]), x, y + size * 0.7, [1, 1], "F", true);
  // jewels
  doc.circle(x + size * 0.15, y + size * 0.22, 1.6, "F");
  doc.circle(x + size * 0.5, y + size * 0.12, 1.8, "F");
  doc.circle(x + size * 0.85, y + size * 0.22, 1.6, "F");
  // base
  doc.rect(x, y + size * 0.72, size, size * 0.12, "F");
}

export function generateInvoice(b: Booking) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;

  // Top title bar
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Invoice", W / 2, 40, { align: "center" });
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFontSize(11);
  doc.text("Download", W - M, 40, { align: "right" });

  // Main card border
  let y = 70;
  doc.setDrawColor(225);
  doc.setLineWidth(0.6);
  doc.roundedRect(M, y, W - M * 2, H - y - 80, 10, 10);

  // Crown + brand
  drawCrown(doc, M + 16, y + 18, 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text("Luxury Cabs", M + 52, y + 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("Safe. Reliable. Comfortable.", M + 52, y + 46);

  // PAID pill
  doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFillColor(232, 245, 233);
  doc.roundedRect(W - M - 90, y + 16, 74, 22, 11, 11, "FD");
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("✓ PAID", W - M - 90 + 37, y + 30, { align: "center" });

  // Company + Invoice details row
  let yy = y + 70;
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Luxury Cabs Pvt. Ltd.", M + 16, yy);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text("HSR Layout, Bengaluru - 560102, Karnataka, India", M + 16, yy + 14);
  doc.text("GSTIN: 29ABCDE1234F1Z5", M + 16, yy + 28);
  doc.text("SAC Code: 996411", M + 16, yy + 42);

  // Right column invoice meta
  const rx = W / 2 + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20);
  doc.text(`Invoice #  ${invoiceNumber(b)}`, rx, yy);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  const metas: [string, string][] = [
    ["Date of Invoice", fmtDate(b.completed_at ?? b.scheduled_at)],
    ["Ride Date & Time", fmtDate(b.scheduled_at)],
    ["Payment Method", (b.payment_method ?? "Cash").toString().toUpperCase()],
    ["Booking ID", bookingNumber(b)],
  ];
  let my = yy + 16;
  metas.forEach(([k, v]) => {
    doc.setTextColor(110);
    doc.text(k, rx, my);
    doc.setTextColor(20);
    doc.text(`: ${v}`, rx + 110, my);
    my += 13;
  });

  // Divider
  yy = Math.max(yy + 60, my + 4);
  doc.setDrawColor(230);
  doc.line(M + 12, yy, W - M - 12, yy);

  // Pickup / Drop / distance & fare summary
  yy += 18;
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("PICKUP LOCATION", M + 16, yy);
  doc.text("DROP LOCATION", M + 200, yy);
  doc.setTextColor(20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(doc.splitTextToSize(b.pickup_address, 170), M + 16, yy + 16);
  doc.text(doc.splitTextToSize(b.drop_address, 170), M + 200, yy + 16);

  // Right metrics
  const mx = W - M - 130;
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("DISTANCE", mx, yy);
  doc.setTextColor(20);
  doc.setFontSize(11);
  doc.text(`${Number(b.distance_km).toFixed(1)} km`, mx, yy + 13);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFontSize(8.5);
  doc.text("DURATION", mx, yy + 30);
  doc.setTextColor(20);
  doc.setFontSize(11);
  doc.text(`${b.duration_min} min`, mx, yy + 43);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFontSize(8.5);
  doc.text("TOTAL FARE", mx, yy + 60);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(formatINR(Number(b.fare)), mx, yy + 75);

  yy += 95;
  doc.setDrawColor(230);
  doc.line(M + 12, yy, W - M - 12, yy);

  // Driver block
  yy += 18;
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("DRIVER DETAILS", M + 16, yy);
  doc.setTextColor(20);
  doc.setFontSize(11);
  doc.text(b.driver_name ?? "—", M + 16, yy + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(b.vehicle_number ?? "—", M + 16, yy + 32);
  doc.text(`${(b.vehicle_model ?? "")}`, M + 16, yy + 46);

  yy += 70;
  doc.setDrawColor(230);
  doc.line(M + 12, yy, W - M - 12, yy);

  // Fare Breakdown
  yy += 18;
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("FARE BREAKDOWN", M + 16, yy);

  yy += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(40);

  const items: [string, number][] = [];
  if (b.trip_type === "outstation") {
    const ov =
      OUTSTATION_VEHICLES.find((v) => v.label.toLowerCase() === (b.vehicle_model ?? "").toLowerCase()) ??
      OUTSTATION_VEHICLES.find((v) => v.tier === (b.vehicle_type as VehicleType)) ??
      OUTSTATION_VEHICLES[0];
    const bd = calcOutstationBreakdown(ov, { distanceKm: Number(b.distance_km), days: 1 });
    items.push([`Distance Fare (${bd.chargedKm} km × ₹${ov.perKm})`, bd.distance]);
    items.push([`Driver Bata (${bd.days} × ₹${ov.bata})`, bd.driverBata]);
    if (bd.nightHalts > 0) items.push([`Night Halt (${bd.nightHalts} × ₹500)`, bd.nightHalt]);
    items.push([`Tolls (est.)`, bd.tolls]);
    items.push([`Taxes & Fees`, bd.taxes]);
  } else {
    const fb = fareBreakdown((b.vehicle_type as VehicleType) ?? "sedan", Number(b.distance_km), b.duration_min);
    items.push(["Base Fare", fb.base]);
    items.push([`Distance Fare (${Number(b.distance_km).toFixed(1)} km)`, fb.distance]);
    items.push([`Time Fare (${b.duration_min} min)`, fb.time]);
    items.push(["Taxes & Fees", fb.taxes]);
  }
  items.forEach(([k, v]) => {
    doc.setTextColor(60);
    doc.text(k, M + 16, yy);
    doc.setTextColor(20);
    doc.text(formatINR(v), W / 2 - 16, yy, { align: "right" });
    yy += 14;
  });

  // Tax details box on right
  const tx = W / 2 + 16;
  const ty = yy - items.length * 14 - 8;
  doc.setFillColor(240, 248, 240);
  doc.roundedRect(tx, ty, W - M - 16 - tx, 90, 6, 6, "F");
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("TAX DETAILS", tx + 12, ty + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const taxTotal = Math.round(Number(b.fare) * 0.05);
  const cgst = Math.round(taxTotal / 2);
  const sgst = taxTotal - cgst;
  doc.setTextColor(60);
  doc.text("CGST (2.5%)", tx + 12, ty + 36);
  doc.setTextColor(20);
  doc.text(formatINR(cgst), W - M - 28, ty + 36, { align: "right" });
  doc.setTextColor(60);
  doc.text("SGST (2.5%)", tx + 12, ty + 52);
  doc.setTextColor(20);
  doc.text(formatINR(sgst), W - M - 28, ty + 52, { align: "right" });
  doc.setDrawColor(200);
  doc.line(tx + 12, ty + 62, W - M - 28, ty + 62);
  doc.setFont("helvetica", "bold");
  doc.text("Total Tax", tx + 12, ty + 78);
  doc.text(formatINR(taxTotal), W - M - 28, ty + 78, { align: "right" });

  // Total Fare row
  yy += 4;
  doc.setDrawColor(220);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(M + 16, yy, W / 2 - 16, yy);
  doc.setLineDashPattern([], 0);
  yy += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text("Total Fare", M + 16, yy);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFontSize(13);
  doc.text(formatINR(Number(b.fare)), W / 2 - 16, yy, { align: "right" });

  // Thank-you bar
  yy += 28;
  doc.setFillColor(240, 248, 240);
  doc.roundedRect(M + 12, yy, W - M * 2 - 24, 56, 8, 8, "F");
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Thank you for choosing Luxury Cabs.", M + 28, yy + 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text("We hope you had a comfortable and safe journey.", M + 28, yy + 38);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Need help?", W / 2 + 30, yy + 18);
  doc.setFont("helvetica", "normal");
  doc.text("☎  080-1234-5678", W / 2 + 30, yy + 32);
  doc.text("✉  support@luxurycabs.com", W / 2 + 30, yy + 46);

  // Footer green bar
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(M, H - 50, W - M * 2, 30, "F");
  doc.setTextColor(255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("www.luxurycabs.com", M + 16, H - 30);
  doc.setFont("helvetica", "bold");
  doc.text("Thank you for riding with us!", W - M - 16, H - 30, { align: "right" });

  doc.save(`LuxuryCabs-${b.id.slice(0, 8)}.pdf`);
}
