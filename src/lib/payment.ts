// Payment helpers — UPI deeplink + card form metadata.
export const MERCHANT_UPI_ID = "mabubbasha9791-1@oksbi";
export const MERCHANT_UPI_NAME = "Luxury Cabs";

export function buildUpiUri(opts: { amount: number; note?: string; txnRef?: string }) {
  const p = new URLSearchParams();
  p.set("pa", MERCHANT_UPI_ID);
  p.set("pn", MERCHANT_UPI_NAME);
  p.set("am", String(Math.round(opts.amount * 100) / 100));
  p.set("cu", "INR");
  if (opts.note) p.set("tn", opts.note);
  if (opts.txnRef) p.set("tr", opts.txnRef);
  return `upi://pay?${p.toString()}`;
}

// QR uses the same payload — render via any QR lib.
export const UPI_QR_DATA = (amount: number, note?: string, ref?: string) =>
  buildUpiUri({ amount, note, txnRef: ref });
