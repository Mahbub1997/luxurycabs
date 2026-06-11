import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Save, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/local-fares")({
  component: AdminLocalFares,
});

type Row = {
  id?: string;
  vehicle_type: string;
  max_km: number;
  base_fare: number;
  per_km: number;
  per_min: number;
  total_fare: number;
  is_above: boolean;
  notes: string | null;
};

function AdminLocalFares() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("local_drop_fares")
      .select("*")
      .order("is_above")
      .order("max_km");
    setRows((data ?? []) as Row[]);
  }
  useEffect(() => { load(); }, []);

  function update(i: number, patch: Partial<Row>) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save(r: Row, key: string) {
    setBusy(key);
    try {
      const payload = {
        vehicle_type: r.vehicle_type,
        max_km: r.max_km,
        base_fare: r.base_fare,
        per_km: r.per_km,
        per_min: r.per_min,
        total_fare: r.total_fare,
        is_above: r.is_above,
        notes: r.notes,
      };
      if (r.id) {
        const { error } = await supabase.from("local_drop_fares").update(payload).eq("id", r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("local_drop_fares").insert(payload);
        if (error) throw error;
      }
      toast.success("Saved");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: Row) {
    if (!r.id) { setRows(rows.filter((x) => x !== r)); return; }
    if (!confirm("Delete this slab?")) return;
    const { error } = await supabase.from("local_drop_fares").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    load();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold">Local drop fares</h2>
          <p className="text-[11px] text-muted-foreground">Fixed slabs by distance. Above-limit row uses per-km rate.</p>
        </div>
        <button
          onClick={() => setRows([...rows, {
            vehicle_type: "sedan", max_km: 2, base_fare: 60, per_km: 30, per_min: 1,
            total_fare: 0, is_above: false, notes: "",
          }])}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> New slab
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const key = r.id || `new-${i}`;
          return (
            <div key={key} className="rounded-2xl border border-border bg-card p-3 text-xs shadow-sm">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Vehicle">
                  <select value={r.vehicle_type} onChange={(e) => update(i, { vehicle_type: e.target.value })}
                    className="rounded-lg border border-border bg-background px-2 py-1.5">
                    <option value="sedan">Sedan</option>
                    <option value="suv">SUV</option>
                  </select>
                </Field>
                <Field label={r.is_above ? "Threshold KM" : "Up to KM"}>
                  <input type="number" step="0.1" value={r.max_km}
                    onChange={(e) => update(i, { max_km: Number(e.target.value) })}
                    className="rounded-lg border border-border bg-background px-2 py-1.5" />
                </Field>
                <Field label="Base Rs.">
                  <input type="number" value={r.base_fare}
                    onChange={(e) => update(i, { base_fare: Number(e.target.value) })}
                    className="rounded-lg border border-border bg-background px-2 py-1.5" />
                </Field>
                <Field label="Per km Rs.">
                  <input type="number" value={r.per_km}
                    onChange={(e) => update(i, { per_km: Number(e.target.value) })}
                    className="rounded-lg border border-border bg-background px-2 py-1.5" />
                </Field>
                <Field label="Per min Rs.">
                  <input type="number" step="0.1" value={r.per_min}
                    onChange={(e) => update(i, { per_min: Number(e.target.value) })}
                    className="rounded-lg border border-border bg-background px-2 py-1.5" />
                </Field>
                <Field label="Total Rs. (slab)">
                  <input type="number" value={r.total_fare}
                    onChange={(e) => update(i, { total_fare: Number(e.target.value) })}
                    className="rounded-lg border border-border bg-background px-2 py-1.5" />
                </Field>
                <label className="col-span-2 flex items-center gap-2">
                  <input type="checkbox" checked={r.is_above}
                    onChange={(e) => update(i, { is_above: e.target.checked })} />
                  <span>Above-limit tier (uses per km only)</span>
                </label>
                <Field label="Notes" full>
                  <input value={r.notes ?? ""} onChange={(e) => update(i, { notes: e.target.value })}
                    className="rounded-lg border border-border bg-background px-2 py-1.5" />
                </Field>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  disabled={busy === key}
                  onClick={() => save(r, key)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  {busy === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Save
                </button>
                <button onClick={() => remove(r)}
                  className="flex items-center justify-center rounded-lg border border-border px-3 py-2 text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No slabs configured.</p>}
      </div>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <span className="text-[10px] uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
