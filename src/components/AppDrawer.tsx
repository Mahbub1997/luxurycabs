import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, Home, Shield, Car, Phone, X } from "lucide-react";
import { getProfile } from "@/lib/profile";

const HELP_PHONE = "9791298406";

export function AppDrawer() {
  const [open, setOpen] = useState(false);
  const profile = typeof window !== "undefined" ? getProfile() : null;
  const showStaffLinks = !profile;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="absolute left-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-foreground shadow-md backdrop-blur"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-72 max-w-[80%] flex-col bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <div className="font-display text-lg font-bold text-primary">Luxury Cabs</div>
                <p className="text-[11px] text-muted-foreground">Comfort. Class. Every ride.</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-full p-1.5 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 text-sm">
              <DrawerLink to="/" Icon={Home} label="Home" onClick={() => setOpen(false)} />
              {showStaffLinks && (
                <>
                  <DrawerLink to="/admin/login" Icon={Shield} label="Admin" onClick={() => setOpen(false)} />
                  <DrawerLink to="/driver/login" Icon={Car} label="Driver" onClick={() => setOpen(false)} />
                </>
              )}
              <a
                href={`tel:${HELP_PHONE}`}
                className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted"
              >
                <Phone className="h-4 w-4 text-primary" />
                <div className="flex flex-col">
                  <span className="font-medium">Help Center</span>
                  <span className="text-[11px] text-muted-foreground">{HELP_PHONE}</span>
                </div>
              </a>
            </nav>

            <div className="border-t border-border px-5 py-3 text-[10px] text-muted-foreground">
              v1.0 — Luxury Cabs
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function DrawerLink({
  to,
  Icon,
  label,
  onClick,
}: {
  to: string;
  Icon: typeof Home;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-primary" />
      <span className="font-medium">{label}</span>
    </Link>
  );
}
