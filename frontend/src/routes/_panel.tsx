import { createFileRoute } from "@tanstack/react-router";
import { guardaPanel } from "@/pages/panel/guarda";
import { PanelLayout } from "@/pages/panel/PanelLayout";

// Rutas del panel: llevan el menú lateral y exigen sesión (la guarda la implementa S4).
export const Route = createFileRoute("/_panel")({
  beforeLoad: guardaPanel,
  component: PanelLayout,
});
