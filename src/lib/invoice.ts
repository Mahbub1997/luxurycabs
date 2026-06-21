import jsPDF from "jspdf";
import type { Booking } from "@/lib/booking-store";
import { fareBreakdown, OUTSTATION_VEHICLES, calcOutstationBreakdown, type VehicleType } from "@/lib/fare";

// Brand color (Luxury Cabs green)
const BRAND = { r: 22, g: 122, b: 56 };

// jsPDF default Helvetica lacks the ₹ glyph (renders as "¹"). Use "Rs." instead.
const inr = (n: number) =>
  `Rs. ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;

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
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}

// Crown drawn as 3 triangle peaks + base bar (legible at small size).
function drawCrown(doc: jsPDF, x: number, y: number, size = 24) {
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  const baseY = y + size * 0.78;
  const topY = y + size * 0.10;
  const midY = y + size * 0.52;
  const w = size;
  // Left peak
  doc.triangle(x, baseY, x + w * 0.25, topY, x + w * 0.33, midY, "F");
  // Center peak
  doc.triangle(x + w * 0.33, midY, x + w * 0.5, topY - size * 0.04, x + w * 0.67, midY, "F");
  // Right peak
  doc.triangle(x + w * 0.67, midY, x + w * 0.75, topY, x + w, baseY, "F");
  // Body fill
  doc.triangle(x, baseY, x + w * 0.33, midY, x + w * 0.67, midY, "F");
  doc.triangle(x, baseY, x + w * 0.67, midY, x + w, baseY, "F");
  // Base bar
  doc.rect(x, baseY, w, size * 0.14, "F");
  // Jewels
  doc.setFillColor(255, 215, 0);
  doc.circle(x + w * 0.25, topY + size * 0.02, 1.4, "F");
  doc.circle(x + w * 0.5, topY - size * 0.02, 1.6, "F");
  doc.circle(x + w * 0.75, topY + size * 0.02, 1.4, "F");
}

export function buildInvoiceDoc(b: Booking) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;

  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Invoice", W / 2, 40, { align: "center" });


  let y = 70;
  doc.setDrawColor(225);
  doc.setLineWidth(0.6);
  doc.roundedRect(M, y, W - M * 2, H - y - 80, 10, 10);

  drawCrown(doc, M + 16, y + 14, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text("Luxury Cabs", M + 56, y + 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text("Safe. Reliable. Comfortable.", M + 56, y + 46);

  // PAID pill
  doc.setDrawColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFillColor(232, 245, 233);
  doc.roundedRect(W - M - 90, y + 16, 74, 22, 11, 11, "FD");
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("PAID", W - M - 90 + 37, y + 30, { align: "center" });

  // Company + Invoice details row
  let yy = y + 70;
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Luxury Cabs", M + 16, yy);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text("Proprietor: Mabubbasha S", M + 16, yy + 14);
  doc.text("Email: luxurycabs5678@gmail.com", M + 16, yy + 28);
  doc.text("Phone / WhatsApp: +91 97912 98406", M + 16, yy + 42);

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
  const dMin = b.duration_min;
  const durLabel = dMin >= 60 ? `${Math.floor(dMin / 60)}h ${dMin % 60}m` : `${dMin} min`;
  doc.text(durLabel, mx, yy + 43);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.setFontSize(8.5);
  doc.text("TOTAL FARE", mx, yy + 60);
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(inr(Number(b.fare)), mx, yy + 75);

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
  doc.text(b.driver_name ?? "-", M + 16, yy + 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(b.vehicle_number ?? "-", M + 16, yy + 32);
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
    items.push([`Distance Fare (${bd.chargedKm} km x Rs.${ov.perKm})`, bd.distance]);
    items.push([`Driver Bata (${bd.days} x Rs.${ov.bata})`, bd.driverBata]);
    if (bd.nightHalts > 0) items.push([`Night Halt (${bd.nightHalts} x Rs.500)`, bd.nightHalt]);
    items.push([`Tolls (est.)`, bd.tolls]);
    items.push([`Taxes & Fees`, bd.taxes]);
  } else {
    const fb = fareBreakdown((b.vehicle_type as VehicleType) ?? "sedan", Number(b.distance_km), b.duration_min);
    items.push(["Base Fare", fb.base]);
    items.push([`Distance Fare (${Number(b.distance_km).toFixed(1)} km)`, fb.distance]);
    items.push([`Time Fare (${durLabel})`, fb.time]);
    items.push(["Taxes & Fees", fb.taxes]);
  }
  items.forEach(([k, v]) => {
    doc.setTextColor(60);
    doc.text(k, M + 16, yy);
    doc.setTextColor(20);
    doc.text(inr(v), W / 2 - 16, yy, { align: "right" });
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
  doc.text(inr(cgst), W - M - 28, ty + 36, { align: "right" });
  doc.setTextColor(60);
  doc.text("SGST (2.5%)", tx + 12, ty + 52);
  doc.setTextColor(20);
  doc.text(inr(sgst), W - M - 28, ty + 52, { align: "right" });
  doc.setDrawColor(200);
  doc.line(tx + 12, ty + 62, W - M - 28, ty + 62);
  doc.setFont("helvetica", "bold");
  doc.text("Total Tax", tx + 12, ty + 78);
  doc.text(inr(taxTotal), W - M - 28, ty + 78, { align: "right" });

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
  doc.text(inr(Number(b.fare)), W / 2 - 16, yy, { align: "right" });

  // Thank-you bar
  yy += 28;
  doc.setFillColor(240, 248, 240);
  doc.roundedRect(M + 12, yy, W - M * 2 - 24, 62, 8, 8, "F");
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
  doc.text("Need help?", W / 2 + 30, yy + 16);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60);
  doc.text("Helpline / WhatsApp: +91 97912 98406", W / 2 + 30, yy + 30);
  doc.text("Email: luxurycabs5678@gmail.com", W / 2 + 30, yy + 44);

  // Footer green bar
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(M, H - 50, W - M * 2, 30, "F");
  doc.setTextColor(255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("luxurycabs5678@gmail.com", M + 16, H - 30);
  doc.setFont("helvetica", "bold");
  doc.text("Thank you for riding with us!", W - M - 16, H - 30, { align: "right" });

  return doc;
}

export function invoiceFileName(b: Booking) {
  return `LuxuryCabs-${b.id.slice(0, 8)}.pdf`;
}

export function generateInvoice(b: Booking) {
  const doc = buildInvoiceDoc(b);
  doc.save(invoiceFileName(b));
}

/** Build PDF as a Blob for upload. */
export function buildInvoiceBlob(b: Booking): Blob {
  const doc = buildInvoiceDoc(b);
  return doc.output("blob");
}

/** Storage path: YYYY-MM/YYYY-MM-DD_tripId.pdf */
export function invoiceStoragePath(b: Booking): string {
  const d = new Date(b.completed_at ?? b.scheduled_at ?? Date.now());
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}/${yyyy}-${mm}-${dd}_${b.id}.pdf`;
}

