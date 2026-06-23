import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Car, Loader2, Camera, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { signupDriver } from "@/lib/driver.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/driver/signup")({
  head: () => ({ meta: [{ title: "Driver Signup — Luxury Cabs" }] }),
  component: DriverSignup,
});

function DriverSignup() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [f, setF] = useState({
    name: "", phone: "",
    license_number: "", vehicle_type: "sedan" as "sedan" | "suv",
    vehicle_model: "", vehicle_number: "",
  });
  const [selfie, setSelfie] = useState<File | null>(null);
  const [license, setLicense] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        navigate({ to: "/driver/login", replace: true });
        return;
      }
      setUid(user.id);
      setEmail(user.email ?? "");
      setF((s) => ({
        ...s,
        name: s.name || user.user_metadata?.full_name || user.user_metadata?.name || "",
      }));
      // If they already have a driver profile, skip the form.
      const { data: existing } = await supabase
        .from("drivers").select("id").eq("user_id", user.id).maybeSingle();
      if (existing) navigate({ to: "/driver", replace: true });
    })();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!uid) return;
    if (!selfie || !license) { toast.error("Selfie and license photos required"); return; }
    setBusy(true);
    try {
      const { user_id } = await signupDriver({ data: { ...f, email } });
      const uploads = [
        { file: selfie, path: `${user_id}/selfie-${Date.now()}.jpg`, field: "selfie_url" as const },
        { file: license, path: `${user_id}/license-${Date.now()}.jpg`, field: "license_photo_url" as const },
      ];
      const patch: { selfie_url?: string; license_photo_url?: string } = {};
      for (const u of uploads) {
        const { error } = await supabase.storage.from("driver-docs").upload(u.path, u.file, { upsert: true });
        if (error) throw error;
        patch[u.field] = u.path;
      }
      await supabase.from("drivers").update(patch).eq("user_id", user_id);
      toast.success("Submitted. Pending admin approval.");
      navigate({ to: "/driver" });
    } catch (e: any) {
      toast.error(e.message || "Signup failed");
    } finally { setBusy(false); }
  }

  if (!uid) {
    return <div className="min-h-screen grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-sm">
        <div className="mb-4 flex items-center gap-2 text-primary">
          <Car className="h-6 w-6" />
          <span className="font-display text-xl font-bold">Driver Registration</span>
        </div>
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
            Signed in as <span className="font-semibold">{email}</span>
          </div>
          <Input label="Full Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required />
          <Input label="Phone Number" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} required />
          <Input label="Driving License Number" value={f.license_number} onChange={(v) => setF({ ...f, license_number: v })} required />

          <div>
            <label className="mb-1 block text-xs font-semibold">Vehicle Type</label>
            <select value={f.vehicle_type} onChange={(e) => setF({ ...f, vehicle_type: e.target.value as any })} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
              <option value="sedan">Sedan</option>
              <option value="suv">SUV</option>
            </select>
          </div>
          <Input label="Vehicle Model" value={f.vehicle_model} onChange={(v) => setF({ ...f, vehicle_model: v })} placeholder="e.g. Swift Dzire" />
          <Input label="Vehicle Number" value={f.vehicle_number} onChange={(v) => setF({ ...f, vehicle_number: v })} placeholder="e.g. TN 70 AB 1234" />

          <FileInput label="Selfie Photo" Icon={Camera} file={selfie} onChange={setSelfie} capture="user" />
          <FileInput label="License Photo" Icon={FileText} file={license} onChange={setLicense} />

          <button disabled={busy} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit for Approval"}
          </button>
          <Link to="/driver/login" className="block text-center text-xs text-primary underline">Use a different account</Link>
        </form>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", required, placeholder, minLength }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string; minLength?: number }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} minLength={minLength} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none" />
    </div>
  );
}

function FileInput({ label, Icon, file, onChange, capture }: { label: string; Icon: any; file: File | null; onChange: (f: File | null) => void; capture?: "user" | "environment" }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold">{label}</label>
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-background p-3 text-xs text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        <span className="flex-1 truncate">{file ? file.name : "Tap to upload photo"}</span>
        <input type="file" accept="image/*" capture={capture} hidden onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  );
}
