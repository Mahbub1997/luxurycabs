import realisticCarTop from "@/assets/realistic-car-top.png";

export { realisticCarTop };

export function VehicleIcon({
  plate,
  className,
  width = 96,
  height = 96,
}: {
  plate: string;
  online?: boolean;
  kind?: "sedan" | "suv";
  showPlate?: boolean;
  className?: string;
  width?: number;
  height?: number;
}) {
  return <img src={realisticCarTop} alt={`Vehicle ${plate}`} width={width} height={height} loading="lazy" className={className} />;
}

/** Highlighted yellow license-plate badge used in driver-details cards. */
export function PlateBadge({ plate, className = "" }: { plate?: string | null; className?: string }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md border-2 border-black bg-yellow-300 px-2.5 py-1 font-mono text-base font-extrabold tracking-[0.15em] text-black shadow-sm " +
        className
      }
    >
      {(plate || "—").toString().toUpperCase()}
    </span>
  );
}
