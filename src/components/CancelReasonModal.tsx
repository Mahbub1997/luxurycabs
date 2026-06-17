import { useState } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";

interface Props {
  title?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  confirmLabel?: string;
}

export function CancelReasonModal({
  title = "Cancel booking",
  description = "Please tell us why you're cancelling. The other party will see this reason.",
  onCancel,
  onConfirm,
  confirmLabel = "Cancel booking",
}: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = reason.trim().length >= 3;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl animate-in slide-in-from-bottom-4 fade-in">
        <div className="mb-2 flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">{title}</h3>
            </div>
          </div>
          <button onClick={onCancel} disabled={busy}><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
        <textarea
          autoFocus
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 300))}
          placeholder="Type your reason here…"
          className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="mt-1 text-right text-[10px] text-muted-foreground">{reason.length}/300</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel} disabled={busy}
            className="rounded-xl border border-border py-2.5 text-sm font-semibold"
          >Keep booking</button>
          <button
            onClick={async () => {
              if (!valid || busy) return;
              setBusy(true);
              try { await onConfirm(reason.trim()); } finally { setBusy(false); }
            }}
            disabled={!valid || busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-destructive py-2.5 text-sm font-bold text-destructive-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
