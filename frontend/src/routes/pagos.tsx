import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Plus, Download, Search, Filter } from "lucide-react";
import { PageHeader, Button, Badge, StatCard } from "@/components/app/ui";
import { pagosData, formatCLP, ingresosMensuales } from "@/lib/mock-data";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/pagos")({
  head: () => ({ meta: [
    { title: "Pagos — Club Colina" },
    { name: "description", content: "Gestión financiera del club." },
    { property: "og:title", content: "Pagos — Club Colina" },
    { property: "og:description", content: "Ingresos, mensualidades y cobranzas." },
  ]}),
  component: Pagos,
});

function Pagos() {
  const total = pagosData.reduce((s, p) => s + p.monto, 0);
  const pagados = pagosData.filter(p => p.estado === "Pagado").reduce((s, p) => s + p.monto, 0);
  const pendientes = pagosData.filter(p => p.estado === "Pendiente").length;
  const atrasados = pagosData.filter(p => p.estado === "Atrasado").length;

  return (
    <div>
      <PageHeader
        icon={<CreditCard className="size-5" />}
        title="Pagos"
        subtitle="Gestión financiera y cobranzas del club"
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="size-4" /> Exportar</Button>
            <Button size="sm"><Plus className="size-4" /> Registrar pago</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Ingresos julio" value={formatCLP(10200000)} delta="+5.2%" />
        <StatCard label="Cobrado" value={formatCLP(pagados)} delta={`${Math.round(pagados*100/total)}%`} />
        <StatCard label="Pendientes" value={String(pendientes)} deltaTone="neutral" delta="Esperando pago" />
        <StatCard label="Atrasados" value={String(atrasados)} deltaTone="negative" delta="Requiere gestión" />
      </div>

      <div className="card-surface p-5 mb-6">
        <div className="font-semibold mb-4">Evolución mensual</div>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={ingresosMensuales}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="mes" tickLine={false} axisLine={false} stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis tickLine={false} axisLine={false} stroke="var(--color-muted-foreground)" fontSize={12} tickFormatter={(v) => `${v/1_000_000}M`} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12 }} formatter={(v: number) => formatCLP(v)} />
              <Bar dataKey="ingresos" fill="var(--color-secondary)" radius={[6,6,0,0]} name="Ingresos" />
              <Bar dataKey="egresos" fill="var(--color-accent)" radius={[6,6,0,0]} name="Egresos" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-4 border-b">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input placeholder="Buscar pago…" className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm bg-background" />
          </div>
          <Button variant="outline" size="sm"><Filter className="size-4" /> Filtros</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Jugador</th>
                <th className="px-4 py-3">Concepto</th>
                <th className="px-4 py-3">Monto</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pagosData.map(p => (
                <tr key={p.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{p.id.toUpperCase()}</td>
                  <td className="px-4 py-3 font-medium">{p.jugador}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.concepto}</td>
                  <td className="px-4 py-3 font-semibold">{formatCLP(p.monto)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.metodo}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.fecha}</td>
                  <td className="px-4 py-3"><Badge tone={p.estado === "Pagado" ? "success" : p.estado === "Pendiente" ? "warning" : "danger"}>{p.estado}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
