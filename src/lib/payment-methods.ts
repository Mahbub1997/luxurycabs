// User payment methods stored locally. Cash is always available implicitly.
export type PMKind = "cash" | "upi" | "card";

export interface PaymentMethod {
  id: string;            // local id
  kind: PMKind;
  label: string;         // display label
  // UPI specific
  upiId?: string;
  // Card specific (last 4 only — never store full PAN)
  cardLast4?: string;
  cardBrand?: string;    // Visa / Master / etc.
  cardName?: string;
}

const LIST_KEY = "luxury_payment_methods";
const PREF_KEY = "luxury_preferred_payment_id";

export const CASH_METHOD: PaymentMethod = { id: "cash", kind: "cash", label: "Cash" };

export function listPaymentMethods(): PaymentMethod[] {
  if (typeof window === "undefined") return [CASH_METHOD];
  try {
    const raw = localStorage.getItem(LIST_KEY);
    const arr: PaymentMethod[] = raw ? JSON.parse(raw) : [];
    return [CASH_METHOD, ...arr.filter((m) => m.id !== "cash")];
  } catch {
    return [CASH_METHOD];
  }
}

export function savePaymentMethod(m: Omit<PaymentMethod, "id"> & { id?: string }): PaymentMethod {
  const list = listPaymentMethods().filter((x) => x.id !== "cash");
  const id = m.id ?? `pm_${Date.now().toString(36)}`;
  const next: PaymentMethod = { ...m, id };
  const merged = [...list.filter((x) => x.id !== id), next];
  localStorage.setItem(LIST_KEY, JSON.stringify(merged));
  if (!getPreferredPaymentId()) setPreferredPaymentId(id);
  return next;
}

export function removePaymentMethod(id: string) {
  if (id === "cash") return;
  const list = listPaymentMethods().filter((x) => x.id !== "cash" && x.id !== id);
  localStorage.setItem(LIST_KEY, JSON.stringify(list));
  if (getPreferredPaymentId() === id) setPreferredPaymentId(null);
}

export function getPreferredPaymentId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PREF_KEY);
}

export function setPreferredPaymentId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(PREF_KEY, id);
  else localStorage.removeItem(PREF_KEY);
}

export function getPreferredPaymentMethod(): PaymentMethod | null {
  const id = getPreferredPaymentId();
  if (!id) return null;
  return listPaymentMethods().find((m) => m.id === id) ?? null;
}

export function detectCardBrand(num: string): string {
  const n = num.replace(/\s/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^6(?:011|5)/.test(n)) return "Discover";
  if (/^(60|65|81|82)/.test(n)) return "RuPay";
  return "Card";
}
