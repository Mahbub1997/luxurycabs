import { Car, Users, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINR, tariffFor, type VehicleType } from "@/lib/fare";

interface Props {
  type: VehicleType;
  fare: number;
  eta?: string;
  selected: boolean;
  onSelect: () => void;
  badge?: string;
  subline?: string;
}

export function VehicleCard({ type, fare, eta, selected, onSelect, badge, subline }: Props) {
  const t = tariffFor(type);
  return (
    <button
      onClick={onSelect}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-2xl border-2 bg-card p-3 text-left transition",
        selected ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40"
      )}
    >
      {badge && (
        <span className="absolute -top-2 left-3 rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
          {badge}
        </span>
      )}
      <div className="grid h-16 w-20 shrink-0 place-items-center rounded-xl bg-secondary">
        <Car className={cn("h-10 w-10", type === "suv" ? "scale-110" : "scale-100", "text-foreground")} strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{t.label}</span>
          <span className="font-bold text-primary">{formatINR(fare)}</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{t.seats} Seats</span>
          <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{t.bags} Bags</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{subline ?? (eta ? `${eta} away` : "")}</div>
      </div>
      <span
        className={cn(
          "ml-2 grid h-5 w-5 place-items-center rounded-full border-2",
          selected ? "border-primary bg-primary" : "border-muted-foreground/40"
        )}
      >
        {selected && <span className="block h-2 w-2 rounded-full bg-primary-foreground" />}
      </span>
    </button>
  );
}
