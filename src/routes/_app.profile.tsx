import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandHeader } from "@/components/Brand";
import { User, ChevronRight, Wallet, MapPin, Shield, LogOut, Phone, Pencil, Save } from "lucide-react";
import { clearProfile, getProfile, saveProfile, type UserProfile } from "@/lib/profile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — Luxury Cabs" }] }),
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => { setProfile(getProfile()); }, []);

  useEffect(() => {
    setName(profile?.name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile]);

  function saveEdits() {
    const next = { name: name.trim() || "Guest Rider", phone: phone.replace(/\D/g, "").slice(-10), createdAt: profile?.createdAt ?? new Date().toISOString() };
    saveProfile(next);
    setProfile(next);
    setEditing(false);
    toast.success("Profile updated");
  }

  const items = [
    { I: MapPin, label: "Saved Addresses", onClick: () => navigate({ to: "/booking" }) },
    { I: Wallet, label: "Payment Methods", onClick: () => alert("Cash on ride is currently the only supported payment method. More options coming soon.") },
    { I: Phone, label: "Help & Support (Toll-free)", onClick: () => { window.location.href = "tel:+919791298406"; } },
    { I: Shield, label: "Safety Center", onClick: () => alert("Your safety is our priority.\n\n• Verified drivers\n• Live trip sharing\n• 24/7 support helpline\n• SOS button on every ride") },
  ];

  async function logout() {
    if (!confirm("Log out of Luxury Cabs?")) return;
    clearProfile();
    try { await supabase.auth.signOut(); } catch {}
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <BrandHeader />
      <div className="mx-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 p-4 text-primary-foreground">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-primary-foreground/15">
          <User className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold">{profile?.name ?? "Guest Rider"}</div>
          <div className="text-xs opacity-80">{profile?.phone ? `+91 ${profile.phone}` : "Not signed in"}</div>
        </div>
        <button onClick={() => setEditing(true)} className="grid h-9 w-9 place-items-center rounded-full bg-primary-foreground/15" aria-label="Edit profile">
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      {editing && (
        <div className="mx-4 rounded-2xl border border-border bg-card p-4">
          <div className="text-sm font-bold">Edit Profile</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone number" inputMode="tel" className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setEditing(false)} className="rounded-xl border border-border py-3 text-sm font-semibold">Cancel</button>
            <button onClick={saveEdits} className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground"><Save className="h-4 w-4" /> Save</button>
          </div>
        </div>
      )}

      <div className="mx-4 divide-y divide-border rounded-2xl border border-border bg-card">
        {items.map(({ I, label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/40"
          >
            <I className="h-5 w-5 text-primary" />
            <span className="flex-1 text-sm font-medium">{label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      <Link
        to="/booking"
        className="mx-4 rounded-2xl border border-border bg-card p-4 text-center text-sm font-semibold text-primary"
      >
        Book your next ride →
      </Link>

      <button
        onClick={logout}
        className="mx-4 mt-2 flex items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-medium text-destructive"
      >
        <LogOut className="h-4 w-4" /> Log out
      </button>
    </div>
  );
}
