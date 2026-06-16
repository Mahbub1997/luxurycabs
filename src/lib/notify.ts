import { toast } from "sonner";

// Browser notification + in-app alert helper for booking lifecycle events.

export type AppAlert = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

const ALERTS_KEY = "luxury_alerts";

function saveAlert(title: string, body: string) {
  if (typeof window === "undefined") return;
  const item: AppAlert = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    body,
    createdAt: new Date().toISOString(),
  };
  try {
    const existing = JSON.parse(localStorage.getItem(ALERTS_KEY) ?? "[]") as AppAlert[];
    localStorage.setItem(ALERTS_KEY, JSON.stringify([item, ...existing].slice(0, 50)));
    window.dispatchEvent(new CustomEvent("luxury-alerts-updated"));
  } catch {}
}

export function getAlerts(): AppAlert[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY) ?? "[]") as AppAlert[]; } catch { return []; }
}

export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch {
    return false;
  }
}

export function beep(durationMs = 350, freq = 880) {
  if (typeof window === "undefined") return;
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.05);
  } catch {}
}

export async function notify(title: string, body: string, icon?: string) {
  saveAlert(title, body);
  toast(title, { description: body });
  beep();
  const ok = await ensureNotifyPermission();
  if (!ok) return;
  try {
    new Notification(title, { body, icon, badge: icon });
  } catch {}
}
