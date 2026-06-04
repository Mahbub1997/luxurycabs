import { createFileRoute, Outlet } from "@tanstack/react-router";
import { BottomNav } from "@/components/BottomNav";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="app-shell flex flex-col">
      <div className="flex-1 pb-2">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}
