import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Banknote, Wallet, CreditCard, X, Loader2, CheckCircle2, Copy } from "lucide-react";
import { buildUpiUri, MERCHANT_UPI_ID, MERCHANT_UPI_NAME } from "@/lib/payment";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type PayMethod = "cash" | "upi" | "card";

interface Props {
  amount: number;
  note?: string;
  txnRef?: string;
  /** Called when user confirms — driver passes this to completeRide. */
  onConfirm: (method: PayMethod) => void | Promise<void>;
  onClose?: () => void;
  busy?: boolean;
  /** Hide cash option for user-facing sheet. */
  hideCash?: boolean;
  /** Title shown at top. */
  title?: string;
}

export function PaymentSheet({ amount, note, txnRef, onConfirm, onClose, busy, hideCash, title = "Choose payment method" }: Props) {
  const [method, setMethod] = useState<PayMethod>(hideCash ? "upi" : "cash");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const upiUri = buildUpiUri({ amount, note, txnRef });

  const cardValid =
    card.number.replace(/\s/g, "").length >= 12 &&
    /^\d{2}\/\d{2}$/.test(card.expiry) &&
    card.cvv.length >= 3 &&
    card.name.trim().length > 0;

  function copyUpi() {
    navigator.clipboard.writeText(MERCHANT_UPI_ID).then(
      () => toast.success("UPI ID copied"),
      () => toast.error("Could not copy")
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom-4 fade-in">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-bold">{title}</h3>
          {onClose && <button onClick={onClose}><X className="h-4 w-4" /></button>}
        </div>
        <div className="text-center text-3xl font-extrabold text-primary">₹{amount.toFixed(2)}</div>
        <div className="mt-1 text-center text-[11px] text-muted-foreground">Inclusive of all taxes</div>

        <div className={cn("mt-4 grid gap-2", hideCash ? "grid-cols-2" : "grid-cols-3")}>
          {!hideCash && (
            <MethodBtn I={Banknote} l="Cash" active={method === "cash"} onClick={() => setMethod("cash")} />
          )}
          <MethodBtn I={Wallet} l="UPI" active={method === "upi"} onClick={() => setMethod("upi")} />
          <MethodBtn I={CreditCard} l="Card" active={method === "card"} onClick={() => setMethod("card")} />
        </div>

        {method === "upi" && (
          <div className="mt-4 rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-center">
              <div className="rounded-xl bg-white p-3 shadow">
                <QRCodeSVG value={upiUri} size={168} level="M" />
              </div>
            </div>
            <div className="mt-3 text-center text-[11px] font-semibold text-muted-foreground">
              Scan with any UPI app to pay {MERCHANT_UPI_NAME}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="font-semibold">{MERCHANT_UPI_ID}</span>
              <button onClick={copyUpi} className="inline-flex items-center gap-1 text-primary">
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
            <a
              href={upiUri}
              className="mt-2 block rounded-xl bg-primary py-2.5 text-center text-sm font-bold text-primary-foreground"
            >
              Open UPI App
            </a>
          </div>
        )}

        {method === "card" && (
          <div className="mt-4 rounded-2xl border border-border bg-background p-4 space-y-3">
            <Field label="Card number" value={card.number}
              onChange={(v) => setCard({ ...card, number: v.replace(/[^\d ]/g, "").slice(0, 19) })}
              placeholder="1234 5678 9012 3456" inputMode="numeric" />
            <Field label="Name on card" value={card.name}
              onChange={(v) => setCard({ ...card, name: v.slice(0, 40) })}
              placeholder="John Doe" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expiry" value={card.expiry}
                onChange={(v) => {
                  const d = v.replace(/\D/g, "").slice(0, 4);
                  setCard({ ...card, expiry: d.length > 2 ? `${d.slice(0,2)}/${d.slice(2)}` : d });
                }}
                placeholder="MM/YY" inputMode="numeric" />
              <Field label="CVV" value={card.cvv}
                onChange={(v) => setCard({ ...card, cvv: v.replace(/\D/g, "").slice(0, 4) })}
                placeholder="123" inputMode="numeric" type="password" />
            </div>
            <div className="text-[10px] text-muted-foreground">🔒 Your card details are encrypted and never stored.</div>
          </div>
        )}

        {method === "cash" && (
          <div className="mt-4 rounded-2xl border border-border bg-background p-4 text-center text-sm">
            <Banknote className="mx-auto h-8 w-8 text-primary" />
            <div className="mt-1 font-semibold">Pay cash to the driver</div>
            <div className="text-[11px] text-muted-foreground">Exact change appreciated.</div>
          </div>
        )}

        <button
          onClick={() => onConfirm(method)}
          disabled={busy || (method === "card" && !cardValid)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
            <><CheckCircle2 className="h-4 w-4" /> Confirm {method === "cash" ? "cash payment" : method === "upi" ? "UPI payment" : "card payment"}</>
          )}
        </button>
      </div>
    </div>
  );
}

function MethodBtn({ I, l, active, onClick }: { I: any; l: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn(
      "flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-xs font-semibold transition",
      active ? "border-primary bg-primary-soft text-primary" : "border-border bg-background text-muted-foreground"
    )}>
      <I className="h-5 w-5" />{l}
    </button>
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
