import { cn } from "@/lib/utils";

export function CrownCarLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 56" className={cn("h-7 w-7 text-green-600", className)} fill="none" aria-hidden>
      {/* Crown */}
      <path d="M14 16 L22 8 L32 18 L42 8 L50 16 L48 24 L16 24 Z" fill="currentColor" />
      <circle cx="22" cy="8" r="2" fill="currentColor" />
      <circle cx="32" cy="6" r="2.2" fill="currentColor" />
      <circle cx="42" cy="8" r="2" fill="currentColor" />
      {/* Car silhouette */}
      <path d="M10 42 L14 30 C 16 26, 22 25, 32 25 C 42 25, 48 26, 50 30 L54 42 L48 42 A4 4 0 1 1 40 42 L24 42 A4 4 0 1 1 16 42 Z" fill="currentColor" opacity=".95"/>
    </svg>
  );
}

export function BrandHeader({ title = "Credoom", right }: { title?: string; right?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 flex h-14 items-center justify-between bg-background/95 px-4 backdrop-blur border-b border-border">
      <div className="w-10" />
      <div className="flex items-center gap-2">
        <CrownCarLogo />
        <span className="font-display text-xl font-bold tracking-tight text-primary">{title}</span>
      </div>
      <div className="flex w-10 justify-end">{right}</div>
    </div>
  );
}
