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
    <img
      src={headerLogo.url}
      alt="Luxury Cabs"
      className={cn("h-8 w-auto object-contain object-left", className)}
      style={{ maxWidth: "70%" }}
    />
  );
}

export function CredoomWordmark({ className, label }: { className?: string; label?: string }) {
  // `label` is accepted for API compatibility but the uploaded logo image is used as the wordmark.
  void label;
  return (
    <div className={cn("flex items-center", className)}>
      <LogoImage />
    </div>
  );
}

export function BrandHeader({ title, right }: { title?: string; right?: React.ReactNode }) {
  void title;
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-background/95 px-4 backdrop-blur border-b border-border">
      <div className="w-10" />
      <LogoImage className="h-7" />
      <div className="flex w-10 justify-end">{right}</div>
    </div>
  );
}
