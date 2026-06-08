import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { upsertFare } from "@/lib/admin.functions";
import { Plus, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/fares")({
  component: AdminFares,
});

type Row = {
  id?: string;
  trip_type: string;
  vehicle_type: string;
  base_fare: number;
  per_km: number;
  per_min: number;
  minimum_fare: number;
  outstation_per_km: number;
};

function AdminFares() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("fare_config").select("*").order("trip_type").order("vehicle_type");
    setRows((data ?? []) as Row[]);
  }
  useEffect(() => { load(); }, []);

  function update(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save(r: Row, key: string) {
    setBusy(key);
    try {
      await upsertFare({ data: r as any });
      toast.success("Saved");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">Fare configuration</h2>
        <button
          onClick={() => setRows([...rows, { trip_type: "local", vehicle_type: "sedan", base_fare: 0, per_km: 0, per_min: 0, minimum_fare: 0, outstation_per_km: 0 }])}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New row
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const key = r.id || `new-${i}`;
          return (
            <div key={key} className="rounded-2xl border border-border bg-card p-3 text-xs shadow-sm">
              <div className="grid grid-cols-2 gap-2">
                <FareInput label="Trip type" value={r.trip_type} onChange={(v) => update(i, { trip_type: v })} />
                <FareInput label="Vehicle" value={r.vehicle_type} onChange={(v) => update(i, { vehicle_type: v })} />
                <FareNum label="Base ₹" value={r.base_fare} onChange={(v) => update(i, { base_fare: v })} />
                <FareNum label="Per km ₹" value={r.per_km} onChange={(v) => update(i, { per_km: v })} />
                <FareNum label="Per min ₹" value={r.per_min} onChange={(v) => update(i, { per_min: v })} />
                <FareNum label="Min fare ₹" value={r.minimum_fare} onChange={(v) => update(i, { minimum_fare: v })} />
                <FareNum label="Outstation /km ₹" value={r.outstation_per_km} onChange={(v) => update(i, { outstation_per_km: v })} />
              </div>
              <button
                disabled={busy === key}
                onClick={() => save(r, key)}
                className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {busy === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </button>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No fares configured.</p>}
      </div>
    </div>
  );
}

function FareInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1.5" />
    </label>
  );
}
function FareNum({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      <input type="number" step="0.01" value={value} onChange={(e) => onChange(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1.5" />
    </label>
  );
}
