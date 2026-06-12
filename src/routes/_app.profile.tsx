import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BrandHeader } from "@/components/Brand";
import { User, ChevronRight, Wallet, MapPin, Shield, LogOut, Phone } from "lucide-react";
import { clearProfile, getProfile, type UserProfile } from "@/lib/profile";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile — Luxury Cabs" }] }),
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  useEffect(() => { setProfile(getProfile()); }, []);

  const items = [
    { I: MapPin, label: "Saved Addresses", onClick: () => navigate({ to: "/booking" }) },
    { I: Wallet, label: "Payment Methods", onClick: () => alert("Cash on ride is currently the only supported payment method. More options coming soon.") },
    { I: Phone, label: "Help & Support (Toll-free)", onClick: () => { window.location.href = "tel:+919791298406"; } },
    { I: Shield, label: "Safety Center", onClick: () => alert("Your safety is our priority.\n\n• Verified drivers\n• Live trip sharing\n• 24/7 support helpline\n• SOS button on every ride") },
  ];

  function logout() {
    if (!confirm("Log out of Luxury Cabs?")) return;
    clearProfile();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <BrandHeader />
      <div className="mx-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-primary to-primary/80 p-4 text-primary-foreground">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-primary-foreground/15">
          <User className="h-7 w-7" />
        </div>
        <div>
          <div className="font-display text-lg font-bold">{profile?.name ?? "Guest Rider"}</div>
          <div className="text-xs opacity-80">{profile?.phone ? `+91 ${profile.phone}` : "Not signed in"}</div>
        </div>
      </div>

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
