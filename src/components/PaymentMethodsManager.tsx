import { useEffect, useState } from "react";
import { Banknote, Wallet, CreditCard, Trash2, Plus, X, Check } from "lucide-react";
import {
  listPaymentMethods, savePaymentMethod, removePaymentMethod,
  getPreferredPaymentId, setPreferredPaymentId, detectCardBrand,
  type PaymentMethod,
} from "@/lib/payment-methods";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  onClose?: () => void;
  /** When true, hides the "preferred" radio (used when picking inside a booking). */
  pickerOnly?: boolean;
  onPick?: (m: PaymentMethod) => void;
}

export function PaymentMethodsManager({ onClose, pickerOnly, onPick }: Props) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [prefId, setPrefId] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<"upi" | "card" | null>(null);

  function refresh() {
    setMethods(listPaymentMethods());
    setPrefId(getPreferredPaymentId());
  }
  useEffect(() => { refresh(); }, []);

  function choosePreferred(id: string) {
    setPreferredPaymentId(id);
    setPrefId(id);
  }

  function handlePick(m: PaymentMethod) {
    choosePreferred(m.id);
    onPick?.(m);
    onClose?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-4 fade-in">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">Payment Methods</h3>
          {onClose && <button onClick={onClose}><X className="h-4 w-4" /></button>}
        </div>

        <div className="space-y-2">
          {methods.map((m) => {
            const Icon = m.kind === "cash" ? Banknote : m.kind === "upi" ? Wallet : CreditCard;
            const selected = prefId === m.id || (prefId === null && m.kind === "cash");
            return (
              <div
                key={m.id}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 p-3 transition",
                  selected ? "border-primary bg-primary-soft/40" : "border-border bg-background"
                )}
              >
                <Icon className={cn("h-5 w-5", selected ? "text-primary" : "text-muted-foreground")} />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => (pickerOnly ? handlePick(m) : choosePreferred(m.id))}
                >
                  <div className="text-sm font-semibold truncate">{m.label}</div>
                  {m.kind === "upi" && <div className="text-[11px] text-muted-foreground truncate">{m.upiId}</div>}
                  {m.kind === "card" && <div className="text-[11px] text-muted-foreground">{m.cardBrand} •••• {m.cardLast4}</div>}
                  {m.kind === "cash" && <div className="text-[11px] text-muted-foreground">Pay driver in cash</div>}
                </button>
                {selected && <Check className="h-4 w-4 text-primary" />}
                {m.kind !== "cash" && (
                  <button
                    onClick={() => { removePaymentMethod(m.id); refresh(); toast.success("Removed"); }}
                    className="rounded-full p-1.5 text-rose-600 hover:bg-rose-50"
                    aria-label="Remove"
                  ><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            );
          })}
        </div>

        {!addKind && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => setAddKind("upi")}
              className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-primary py-3 text-sm font-bold text-primary"
            ><Plus className="h-4 w-4" /> Add UPI</button>
            <button
              onClick={() => setAddKind("card")}
              className="flex items-center justify-center gap-1.5 rounded-xl border-2 border-primary py-3 text-sm font-bold text-primary"
            ><Plus className="h-4 w-4" /> Add Card</button>
          </div>
        )}

        {addKind === "upi" && (
          <AddUpi onCancel={() => setAddKind(null)} onSaved={() => { setAddKind(null); refresh(); }} />
        )}
        {addKind === "card" && (
          <AddCard onCancel={() => setAddKind(null)} onSaved={() => { setAddKind(null); refresh(); }} />
        )}
      </div>
    </div>
  );
}

function AddUpi({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [upiId, setUpiId] = useState("");
  const valid = /^[\w.\-]{2,}@[\w.\-]{2,}$/.test(upiId.trim());
  return (
    <div className="mt-4 rounded-2xl border border-border bg-background p-4 space-y-3">
      <div className="text-sm font-bold">Add UPI ID</div>
      <input
        value={upiId}
        onChange={(e) => setUpiId(e.target.value)}
        placeholder="yourname@oksbi"
        className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onCancel} className="rounded-xl border border-border py-2.5 text-sm font-semibold">Cancel</button>
        <button
          disabled={!valid}
          onClick={() => {
            savePaymentMethod({ kind: "upi", label: "UPI", upiId: upiId.trim() });
            toast.success("UPI added");
            onSaved();
          }}
          className="rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >Save</button>
      </div>
    </div>
  );
}

function AddCard({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => void }) {
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [name, setName] = useState("");
  const digits = number.replace(/\s/g, "");
  const valid = digits.length >= 12 && /^\d{2}\/\d{2}$/.test(expiry) && cvv.length >= 3 && name.trim().length > 0;
  return (
    <div className="mt-4 rounded-2xl border border-border bg-background p-4 space-y-3">
      <div className="text-sm font-bold">Add Card</div>
      <Field label="Card number" value={number} placeholder="1234 5678 9012 3456" inputMode="numeric"
        onChange={(v) => setNumber(v.replace(/[^\d ]/g, "").slice(0, 19))} />
      <Field label="Name on card" value={name} placeholder="John Doe"
        onChange={(v) => setName(v.slice(0, 40))} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expiry" value={expiry} placeholder="MM/YY" inputMode="numeric"
          onChange={(v) => {
            const d = v.replace(/\D/g, "").slice(0, 4);
            setExpiry(d.length > 2 ? `${d.slice(0,2)}/${d.slice(2)}` : d);
          }} />
        <Field label="CVV" value={cvv} placeholder="123" inputMode="numeric" type="password"
          onChange={(v) => setCvv(v.replace(/\D/g, "").slice(0, 4))} />
      </div>
      <div className="text-[10px] text-muted-foreground">🔒 Only the last 4 digits are stored on this device. CVV is never saved.</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={onCancel} className="rounded-xl border border-border py-2.5 text-sm font-semibold">Cancel</button>
        <button
          disabled={!valid}
          onClick={() => {
            const last4 = digits.slice(-4);
            const brand = detectCardBrand(digits);
            savePaymentMethod({ kind: "card", label: `${brand} •••• ${last4}`, cardLast4: last4, cardBrand: brand, cardName: name.trim() });
            toast.success("Card added");
            onSaved();
          }}
          className="rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >Save</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", inputMode }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; inputMode?: any;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
