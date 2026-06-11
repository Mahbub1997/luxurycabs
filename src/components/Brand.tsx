import { cn } from "@/lib/utils";
import { Crown } from "lucide-react";

export function CrownCarLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm",
        className,
      )}
      aria-hidden
    >
      <Crown className="h-[60%] w-[60%]" strokeWidth={2.5} />
    </span>
  );
}

function LogoImage({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label="Luxury Cabs">
      <CrownCarLogo />
      <span className="text-lg font-semibold tracking-tight text-primary">Luxury Cabs</span>
    </div>
  );
}

export function CredoomWordmark({ className, label }: { className?: string; label?: string }) {
  void label;
  return (
    <div className={cn("flex items-center", className)}>
      <LogoImage className="text-2xl" />
    </div>
  );
}

export function BrandHeader({ title, right }: { title?: string; right?: React.ReactNode }) {
  void title;
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-background/95 px-4 backdrop-blur border-b border-border">
      <div className="w-10" />
      <LogoImage />
      <div className="flex w-10 justify-end">{right}</div>
    </div>
  );
}
