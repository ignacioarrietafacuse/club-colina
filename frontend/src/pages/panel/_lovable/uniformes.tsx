import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Shirt, Search, Info, RefreshCw } from "lucide-react";
import { PageHeader, Card, Badge, Avatar } from "@/components/panel/ui";
import { uniformes, uniformeEstados, teams, type UniformeEstado } from "./mock-data";

export const Route = createFileRoute("/uniformes")({
  head: () => ({ meta: [
    { title: "Uniformes — Club Colina" },
    { name: "description", content: "Consulta el estado de los pedidos de uniformes de cada jugador del club: talla, prenda, fecha estimada y última actualización." },
    { property: "og:title", content: "Uniformes — Club Colina" },
    { property: "og:description", content: "Estado de los pedidos de uniformes sincronizado con el proveedor externo." },
  ]}),
  component: Uniformes,
});

const estadoTone: Record<UniformeEstado, "neutral" | "info" | "warning" | "success" | "accent" | "primary"> = {
  "Pedido recibido": "neutral",
  "En producción": "warning",
  "Listo para despacho": "info",
  "Enviado": "primary",
  "Disponible para retiro": "accent",
  "Entregado": "success",
};

function Uniformes() {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<string>("todos");
  const [categoria, setCategoria] = useState<string>("todas");
  const [disciplina, setDisciplina] = useState<string>("todas");

  const categorias = useMemo(() => Array.from(new Set(teams.map(t => t.category))), []);

  const rows = useMemo(() => uniformes.filter(u => {
    if (estado !== "todos" && u.estado !== estado) return false;
    if (categoria !== "todas" && u.categoria !== categoria) return false;
    if (disciplina !== "todas" && u.disciplina !== disciplina) return false;
    if (q && !`${u.jugador} ${u.prenda} ${u.categoria}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [q, estado, categoria, disciplina]);

  const activos = uniformes.filter(u => u.estado !== "Entregado").length;
  const paraRetiro = uniformes.filter(u => u.estado === "Disponible para retiro").length;
  const enProduccion = uniformes.filter(u => u.estado === "En producción").length;

  return (
    <div>
      <PageHeader
        icon={<Shirt className="size-5" />}
        title="Uniformes"
        subtitle="Estado de los pedidos sincronizado con el proveedor externo · solo consulta"
        actions={<Badge tone="info"><RefreshCw className="size-3" /> Sincronizado hoy</Badge>}
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-dashed bg-muted/40 p-4 text-xs text-muted-foreground">
        <Info className="size-4 shrink-0 mt-0.5 text-secondary" />
        <span>
          La confección la realiza el proveedor externo. Aquí solo se visualiza el estado de cada pedido para responder
          rápidamente a los apoderados; la misma información alimenta al Asistente IA.
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MiniStat label="Pedidos activos" value={String(activos)} sub="aún no entregados" />
        <MiniStat label="En producción" value={String(enProduccion)} sub="con el proveedor" />
        <MiniStat label="Disponibles para retiro" value={String(paraRetiro)} sub="en oficina del club" />
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar por jugador, prenda o categoría…"
              className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-secondary/60"
            />
          </div>
          <Select value={estado} onChange={setEstado} options={[["todos", "Todos los estados"], ...uniformeEstados.map(e => [e, e] as [string, string])]} />
          <Select value={categoria} onChange={setCategoria} options={[["todas", "Todas las categorías"], ...categorias.map(c => [c, c] as [string, string])]} />
          <Select value={disciplina} onChange={setDisciplina} options={[["todas", "Todas las disciplinas"], ["basketball", "🏀 Basketball"], ["volleyball", "🏐 Voleibol"]]} />
        </div>
      </Card>

      <div className="card-surface overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Jugador</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Disciplina</th>
                <th className="px-4 py-3 font-medium">Prenda</th>
                <th className="px-4 py-3 font-medium">Talla</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Pedido</th>
                <th className="px-4 py-3 font-medium">Estimada</th>
                <th className="px-4 py-3 font-medium">Actualización</th>
                <th className="px-4 py-3 font-medium">Observaciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(u => (
                <tr key={u.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.jugador} size={32} discipline={u.disciplina} />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{u.jugador}</div>
                        <div className="text-[11px] text-muted-foreground">Dorsal {u.numero}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{u.categoria}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{u.disciplina === "basketball" ? "🏀 Basketball" : "🏐 Voleibol"}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{u.prenda}</td>
                  <td className="px-4 py-3 font-medium">{u.talla}</td>
                  <td className="px-4 py-3 whitespace-nowrap"><Badge tone={estadoTone[u.estado]}>{u.estado}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{u.fechaPedido}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{u.fechaEstimada}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{u.actualizado}</td>
                  <td className="px-4 py-3 text-muted-foreground"><span className="block max-w-[220px] truncate" title={u.observaciones}>{u.observaciones || "—"}</span></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">Sin pedidos que coincidan con los filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Mostrando {rows.length} de {uniformes.length} pedidos
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card-surface p-5 card-hover">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-secondary/60"
    >
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
