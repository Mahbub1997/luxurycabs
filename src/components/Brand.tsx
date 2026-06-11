import { cn } from "@/lib/utils";
import headerLogo from "@/assets/luxury-cabs-header.jpg.asset.json";

export function CrownCarLogo({ className }: { className?: string }) {
  // Kept for backwards-compatibility; renders the crown+wordmark image cropped to the logo area.
  return (
    <span
      className={cn("inline-block h-7 w-7 overflow-hidden", className)}
      aria-hidden
    >
      <img
        src={headerLogo.url}
        alt=""
        className="h-full w-auto object-cover object-left"
        style={{ aspectRatio: "1 / 1" }}
      />
    </span>
  );
}

function LogoImage({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-label="Luxury Cabs">
      <CrownCarLogo className="h-7 w-7 shrink-0" />
      <span className="text-lg font-semibold text-primary">Luxury Cabs</span>
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
