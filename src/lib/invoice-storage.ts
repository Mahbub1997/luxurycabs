import { supabase } from "@/integrations/supabase/client";
import type { Booking } from "@/lib/booking-store";
import { buildInvoiceBlob, invoiceStoragePath, invoiceFileName } from "@/lib/invoice";

const BUCKET = "invoices";

/** Upload (or replace) the invoice PDF for a booking and persist URL/path on the row. */
export async function uploadInvoiceFor(b: Booking): Promise<{ path: string; signedUrl: string }> {
  const blob = buildInvoiceBlob(b);
  const path = invoiceStoragePath(b);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: "application/pdf" });
  if (upErr) throw upErr;

  // Remove any file stored under an older folder scheme.
  const oldPath = (b as any).invoice_path as string | null;
  if (oldPath && oldPath !== path) {
    await supabase.storage.from(BUCKET).remove([oldPath]);
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 year
  if (sErr) throw sErr;

  await supabase
    .from("bookings")
    .update({
      invoice_path: path,
      invoice_url: signed.signedUrl,
      invoice_generated_at: new Date().toISOString(),
    } as any)
    .eq("id", b.id);

  return { path, signedUrl: signed.signedUrl };
}

/** Ensure an invoice exists (in the current folder format) for a completed booking. */
export async function ensureInvoiceFor(b: Booking): Promise<string> {
  const anyB = b as any;
  const wanted = invoiceStoragePath(b);
  if (anyB.invoice_path === wanted) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(anyB.invoice_path, 60 * 60 * 24 * 7);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  const { signedUrl } = await uploadInvoiceFor(b);
  return signedUrl;
}

/** Does this booking already have an invoice saved in the current folder format? */
export function invoiceIsCurrent(b: Booking): boolean {
  return (b as any).invoice_path === invoiceStoragePath(b);
}

/** Download as user file via fetch + save. */
export async function downloadInvoice(b: Booking) {
  const url = await ensureInvoiceFor(b);
  const res = await fetch(url);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = invoiceFileName(b);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function deleteInvoiceFor(b: Booking) {
  const path = (b as any).invoice_path as string | null;
  if (path) {
    await supabase.storage.from(BUCKET).remove([path]);
  }
  await supabase
    .from("bookings")
    .update({ invoice_path: null, invoice_url: null, invoice_generated_at: null } as any)
    .eq("id", b.id);
}

export async function shareInvoice(b: Booking) {
  const url = await ensureInvoiceFor(b);
  const text = `Luxury Cabs invoice for trip on ${new Date(b.completed_at ?? b.scheduled_at).toLocaleDateString()} — Total ₹${Number(b.fare).toLocaleString("en-IN")}\n${url}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Luxury Cabs Invoice", text, url });
      return;
    } catch {}
  }
  await navigator.clipboard.writeText(text);
}

export function shareInvoiceWhatsApp(url: string, b: Booking) {
  const msg = encodeURIComponent(
    `Luxury Cabs invoice — ${new Date(b.completed_at ?? b.scheduled_at).toLocaleDateString()}\nTotal ₹${Number(b.fare).toLocaleString("en-IN")}\n${url}`
  );
  window.open(`https://wa.me/?text=${msg}`, "_blank");
}

export function shareInvoiceEmail(url: string, b: Booking) {
  const subject = encodeURIComponent(`Luxury Cabs Invoice — ${b.id.slice(0, 8).toUpperCase()}`);
  const body = encodeURIComponent(
    `Hello,\n\nPlease find your Luxury Cabs invoice attached:\n${url}\n\nTotal: ₹${Number(b.fare).toLocaleString("en-IN")}\n\nThank you for riding with Luxury Cabs.`
  );
  window.location.href = `mailto:?subject=${subject}&body=${body}`;
}
