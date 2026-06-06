import { Users, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINR, tariffFor, type VehicleType } from "@/lib/fare";
import sedanImg from "@/assets/sedan.png";
import suvImg from "@/assets/suv.png";

interface Props {
  type: VehicleType;
  fare?: number;
  selected: boolean;
  onSelect: () => void;
}

export function VehicleCard({ type, fare, selected, onSelect }: Props) {
  const t = tariffFor(type);
  const img = type === "sedan" ? sedanImg : suvImg;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-3 text-left transition",
        selected ? "border-foreground" : "border-border hover:border-foreground/30"
      )}
    >
      <div className="grid h-20 w-28 shrink-0 place-items-center rounded-xl bg-white">
        <img
          src={img}
          alt={t.label}
          width={112}
          height={80}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-base font-bold text-foreground">{t.label}</span>
          {fare && fare > 0 ? (
            <span className="text-sm font-bold text-foreground">{formatINR(fare)}</span>
          ) : null}
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {t.seats} Seats
          </span>
          <span className="text-muted-foreground/40">|</span>
          <span className="inline-flex items-center gap-1">
            <Snowflake className="h-3.5 w-3.5" />
            AC
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">Best for {t.seats} People</div>
      </div>
      <span
        className={cn(
          "ml-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
          selected ? "border-foreground bg-foreground" : "border-muted-foreground/40 bg-white"
        )}
      >
        {selected && <span className="block h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
    </button>
  );
}
