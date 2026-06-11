import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(totalMin: number): string {
  const m = Math.max(0, Math.round(totalMin));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  const hLabel = h === 1 ? "hour" : "hours";
  return rem === 0 ? `${h} ${hLabel}` : `${h} ${hLabel} ${rem} min`;
}

export function formatTime12(d: Date): string {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatDateTime12(d: Date): string {
  return `${d.toLocaleDateString()} ${formatTime12(d)}`;
}
