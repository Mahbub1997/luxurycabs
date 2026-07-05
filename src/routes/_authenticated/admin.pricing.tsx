import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { upsertFare } from "@/lib/admin.functions";
import { Plus, Save, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/pricing")({
  component: AdminPricing,
});

type Tab = "local-sedan" | "local-suv" | "rental-sedan" | "rental-suv" | "outstation-sedan" | "outstation-suv" | "outstation-cfg";

function AdminPricing() {
  const [tab, setTab] = useState<Tab>("local-sedan");
  const groups: { title: string; tabs: { id: Tab; label: string }[] }[] = [
    { title: "Local", tabs: [
      { id: "local-sedan", label: "Sedan" },
      { id: "local-suv", label: "SUV" },
    ]},
    { title: "Rental", tabs: [
      { id: "rental-sedan", label: "Sedan" },
      { id: "rental-suv", label: "SUV" },
    ]},
    { title: "Outstation", tabs: [
      { id: "outstation-sedan", label: "Sedan" },
      { id: "outstation-suv", label: "SUV" },
      { id: "outstation-cfg", label: "Config" },
    ]},
  ];
  return (
    <div>
      <h2 className="mb-2 text-base font-bold">Pricing</h2>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Sedan and SUV pricing is kept in separate tabs so nothing gets mixed up.
        Changes save immediately and apply to new bookings.
      </p>
      <div className="mb-4 space-y-2">
        {groups.map((g) => (
          <div key={g.title}>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.title}</div>
            <div className="flex gap-2 overflow-x-auto">
              {g.tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold",
                    tab === t.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {tab === "local-sedan" && <LocalFares filterVehicle="sedan" />}
      {tab === "local-suv" && <LocalFares filterVehicle="suv" />}
      {tab === "rental-sedan" && <RentalFares vehicle="sedan" />}
      {tab === "rental-suv" && <RentalFares vehicle="suv" />}
      {tab === "outstation-sedan" && <OutstationFares filterTier="sedan" />}
      {tab === "outstation-suv" && <OutstationFares filterTier="suv" />}
      {tab === "outstation-cfg" && <OutstationConfig />}
    </div>
  );
}

// ---------------- LOCAL ----------------
type LocalRow = {
  id?: string;
  trip_type: string;
  vehicle_type: string;
  base_fare: number;
  per_km: number;
  per_min: number;
  minimum_fare: number;
  outstation_per_km: number;
};
function LocalFares({ filterVehicle }: { filterVehicle?: "sedan" | "suv" }) {
  const [rows, setRows] = useState<LocalRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  async function load() {
    let q = supabase.from("fare_config").select("*").order("trip_type").order("vehicle_type");
    if (filterVehicle) q = q.eq("vehicle_type", filterVehicle);
    const { data } = await q;
    setRows((data ?? []) as LocalRow[]);
  }
  useEffect(() => { load(); }, []);
  function update(i: number, patch: Partial<LocalRow>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  async function save(r: LocalRow, key: string) {
    setBusy(key);
    try { await upsertFare({ data: r as any }); toast.success("Saved"); load(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          onClick={() => setRows([...rows, { trip_type: "local", vehicle_type: "sedan", base_fare: 0, per_km: 0, per_min: 0, minimum_fare: 0, outstation_per_km: 0 }])}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New row
        </button>
      </div>
      {rows.map((r, i) => {
        const key = r.id || `new-${i}`;
        return (
          <div key={key} className="rounded-2xl border border-border bg-card p-3 text-xs shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              <Str label="Trip type" value={r.trip_type} onChange={(v) => update(i, { trip_type: v })} />
              <Str label="Vehicle" value={r.vehicle_type} onChange={(v) => update(i, { vehicle_type: v })} />
              <Num label="Base ₹" value={r.base_fare} onChange={(v) => update(i, { base_fare: v })} />
              <Num label="Per km ₹" value={r.per_km} onChange={(v) => update(i, { per_km: v })} />
              <Num label="Per min ₹" value={r.per_min} onChange={(v) => update(i, { per_min: v })} />
              <Num label="Min fare ₹" value={r.minimum_fare} onChange={(v) => update(i, { minimum_fare: v })} />
              <Num label="Outstation /km ₹" value={r.outstation_per_km} onChange={(v) => update(i, { outstation_per_km: v })} />
            </div>
            <SaveBtn busy={busy === key} onClick={() => save(r, key)} />
          </div>
        );
      })}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No fares configured.</p>}
    </div>
  );
}

// ---------------- RENTAL ----------------
type RentalRow = {
  id?: string;
  code: string;
  label: string;
  hours: number;
  km: number;
  sedan_price: number;
  suv_price: number;
  extra_per_hour: number;
  extra_per_km: number;
  sub: string | null;
  sort_order: number;
  active: boolean;
};
function RentalFares({ vehicle }: { vehicle: "sedan" | "suv" }) {
  const priceKey = vehicle === "sedan" ? "sedan_price" : "suv_price";
  const [rows, setRows] = useState<RentalRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  async function load() {
    const { data } = await (supabase as any).from("rental_packages").select("*").order("sort_order");
    setRows((data ?? []) as RentalRow[]);
  }
  useEffect(() => { load(); }, []);
  function update(i: number, patch: Partial<RentalRow>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  async function save(r: RentalRow, key: string) {
    setBusy(key);
    try {
      const payload = { code: r.code, label: r.label, hours: r.hours, km: r.km, sedan_price: r.sedan_price, suv_price: r.suv_price, extra_per_hour: r.extra_per_hour, extra_per_km: r.extra_per_km, sub: r.sub, sort_order: r.sort_order, active: r.active };
      const q = r.id
        ? (supabase as any).from("rental_packages").update(payload).eq("id", r.id)
        : (supabase as any).from("rental_packages").insert(payload);
      const { error } = await q; if (error) throw error;
      toast.success("Saved"); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }
  async function remove(r: RentalRow) {
    if (!r.id) { setRows(rows.filter((x) => x !== r)); return; }
    if (!confirm("Delete this package?")) return;
    const { error } = await (supabase as any).from("rental_packages").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
          {vehicle === "sedan" ? "Sedan" : "SUV"} rental packages
        </div>
        <button
          onClick={() => setRows([...rows, { code: "", label: "", hours: 4, km: 40, sedan_price: 0, suv_price: 0, extra_per_hour: 0, extra_per_km: 0, sub: "", sort_order: rows.length + 1, active: true }])}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New package
        </button>
      </div>
      {rows.map((r, i) => {
        const key = r.id || `new-${i}`;
        return (
          <div key={key} className="rounded-2xl border border-border bg-card p-3 text-xs shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              <Str label="Code (unique)" value={r.code} onChange={(v) => update(i, { code: v })} />
              <Str label="Label" value={r.label} onChange={(v) => update(i, { label: v })} />
              <Num label="Hours" value={r.hours} onChange={(v) => update(i, { hours: v })} />
              <Num label="KM included" value={r.km} onChange={(v) => update(i, { km: v })} />
              <Num
                label={`${vehicle === "sedan" ? "Sedan" : "SUV"} price ₹`}
                value={r[priceKey] as number}
                onChange={(v) => update(i, { [priceKey]: v } as any)}
              />
              <Num label="Extra ₹/hour" value={r.extra_per_hour} onChange={(v) => update(i, { extra_per_hour: v })} />
              <Num label="Extra ₹/km" value={r.extra_per_km} onChange={(v) => update(i, { extra_per_km: v })} />
              <Num label="Sort order" value={r.sort_order} onChange={(v) => update(i, { sort_order: v })} />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={r.active} onChange={(e) => update(i, { active: e.target.checked })} />
                <span>Active</span>
              </label>
              <Str label="Subtitle" value={r.sub ?? ""} onChange={(v) => update(i, { sub: v })} full />
            </div>
            <ActionRow busy={busy === key} onSave={() => save(r, key)} onDelete={() => remove(r)} />
          </div>
        );
      })}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No rental packages configured.</p>}
    </div>
  );
}

// ---------------- OUTSTATION ----------------
type OutRow = {
  id?: string;
  code: string;
  label: string;
  tier: string;
  per_km: number;
  bata: number;
  seats: number;
  bags: number;
  sort_order: number;
  active: boolean;
};
function OutstationFares({ filterTier }: { filterTier?: "sedan" | "suv" }) {
  const [rows, setRows] = useState<OutRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  async function load() {
    let q = (supabase as any).from("outstation_vehicles").select("*").order("sort_order");
    if (filterTier) q = q.eq("tier", filterTier);
    const { data } = await q;
    setRows((data ?? []) as OutRow[]);
  }
  useEffect(() => { load(); }, []);
  function update(i: number, patch: Partial<OutRow>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  async function save(r: OutRow, key: string) {
    setBusy(key);
    try {
      const payload = { code: r.code, label: r.label, tier: r.tier, per_km: r.per_km, bata: r.bata, seats: r.seats, bags: r.bags, sort_order: r.sort_order, active: r.active };
      const q = r.id
        ? (supabase as any).from("outstation_vehicles").update(payload).eq("id", r.id)
        : (supabase as any).from("outstation_vehicles").insert(payload);
      const { error } = await q; if (error) throw error;
      toast.success("Saved"); load();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  }
  async function remove(r: OutRow) {
    if (!r.id) { setRows(rows.filter((x) => x !== r)); return; }
    if (!confirm("Delete this vehicle?")) return;
    const { error } = await (supabase as any).from("outstation_vehicles").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); load();
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          onClick={() => setRows([...rows, { code: "", label: "", tier: "sedan", per_km: 12, bata: 400, seats: 4, bags: 2, sort_order: rows.length + 1, active: true }])}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New vehicle
        </button>
      </div>
      {rows.map((r, i) => {
        const key = r.id || `new-${i}`;
        return (
          <div key={key} className="rounded-2xl border border-border bg-card p-3 text-xs shadow-sm">
            <div className="grid grid-cols-2 gap-2">
              <Str label="Code (unique)" value={r.code} onChange={(v) => update(i, { code: v })} />
              <Str label="Label" value={r.label} onChange={(v) => update(i, { label: v })} />
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase text-muted-foreground">Tier</span>
                <select value={r.tier} onChange={(e) => update(i, { tier: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-1.5">
                  <option value="sedan">sedan</option><option value="suv">suv</option>
                </select>
              </label>
              <Num label="Per km ₹" value={r.per_km} onChange={(v) => update(i, { per_km: v })} />
              <Num label="Driver bata ₹/day" value={r.bata} onChange={(v) => update(i, { bata: v })} />
              <Num label="Seats" value={r.seats} onChange={(v) => update(i, { seats: v })} />
              <Num label="Bags" value={r.bags} onChange={(v) => update(i, { bags: v })} />
              <Num label="Sort order" value={r.sort_order} onChange={(v) => update(i, { sort_order: v })} />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={r.active} onChange={(e) => update(i, { active: e.target.checked })} />
                <span>Active</span>
              </label>
            </div>
            <ActionRow busy={busy === key} onSave={() => save(r, key)} onDelete={() => remove(r)} />
          </div>
        );
      })}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No outstation vehicles configured.</p>}
    </div>
  );
}

// ---------------- OUTSTATION CONFIG ----------------
function OutstationConfig() {
  const [cfg, setCfg] = useState<{ night_halt: number; min_km_per_day: number; tax_percent: number } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    (supabase as any).from("outstation_config").select("*").eq("id", 1).maybeSingle()
      .then(({ data }: any) => setCfg({
        night_halt: Number(data?.night_halt ?? 500),
        min_km_per_day: Number(data?.min_km_per_day ?? 300),
        tax_percent: Number(data?.tax_percent ?? 5),
      }));
  }, []);
  async function save() {
    if (!cfg) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).from("outstation_config").upsert({ id: 1, ...cfg });
      if (error) throw error;
      toast.success("Saved");
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  if (!cfg) return <Loader2 className="h-4 w-4 animate-spin" />;
  return (
    <div className="rounded-2xl border border-border bg-card p-3 text-xs shadow-sm">
      <div className="grid grid-cols-2 gap-2">
        <Num label="Night halt ₹" value={cfg.night_halt} onChange={(v) => setCfg({ ...cfg, night_halt: v })} />
        <Num label="Min km/day" value={cfg.min_km_per_day} onChange={(v) => setCfg({ ...cfg, min_km_per_day: v })} />
        <Num label="Tax %" value={cfg.tax_percent} onChange={(v) => setCfg({ ...cfg, tax_percent: v })} />
      </div>
      <SaveBtn busy={busy} onClick={save} />
    </div>
  );
}

// ---------------- Small controls ----------------
function Str({ label, value, onChange, full }: { label: string; value: string; onChange: (v: string) => void; full?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1", full && "col-span-2")}>
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5" />
    </label>
  );
}
function Num({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <input type="number" step="0.01" value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1.5" />
    </label>
  );
}
function SaveBtn({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button disabled={busy} onClick={onClick} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
      Save
    </button>
  );
}
function ActionRow({ busy, onSave, onDelete }: { busy: boolean; onSave: () => void; onDelete: () => void }) {
  return (
    <div className="mt-2 flex gap-2">
      <button disabled={busy} onClick={onSave} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Save
      </button>
      <button onClick={onDelete} className="flex items-center justify-center rounded-lg border border-border px-3 py-2 text-destructive">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
