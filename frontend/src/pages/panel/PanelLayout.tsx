import { Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/panel/AppShell";

export function PanelLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
