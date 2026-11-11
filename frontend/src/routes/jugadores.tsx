import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Users, Filter, Download, Plus, Search, MoreHorizontal, Mail, MessageSquare, Eye } from "lucide-react";
import { PageHeader, Button, Badge, DisciplineBadge, StatCard, Avatar } from "@/components/app/ui";
import { players, categories } from "@/lib/mock-data";

export const Route = createFileRoute("/jugadores")({
  head: () => ({ meta: [
    { title: "Jugadores — Club Colina" },
    { name: "description", content: "Gestión completa de jugadores del club." },
    { property: "og:title", content: "Jugadores — Club Colina" },
    { property: "og:description", content: "Administra a los deportistas del club." },
  ]}),
  component: Jugadores,
});

function Jugadores() {
  const [q, setQ] = useState("");
  const [disc, setDisc] = useState<"all" | "basketball" | "volleyball">("all");
  const [cat, setCat] = useState<string>("all");

  const filtered = useMemo(() => players.filter(p => {
    if (disc !== "all" && p.disciplina !== disc) return false;
    if (cat !== "all" && p.categoria !== cat) return false;
    if (q && !`${p.nombre} ${p.apellido} ${p.equipo}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [q, disc, cat]);

  return (
    <div>
      <PageHeader
        icon={<Users className="size-5" />}
        title="Jugadores"
        subtitle={`${players.length} jugadores activos en el club`}
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="size-4" /> Exportar</Button>
            <Button size="sm"><Plus className="size-4" /> Nuevo jugador</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total activos" value={String(players.filter(p => p.estado === "Activo").length)} delta="+8 este mes" />
        <StatCard label="Basketball" value={String(players.filter(p => p.disciplina === "basketball").length)} delta="+3" />
        <StatCard label="Voleibol" value={String(players.filter(p => p.disciplina === "volleyball").length)} delta="+5" />
        <StatCard label="En prueba" value={String(players.filter(p => p.estado === "En prueba").length)} delta="4 esta semana" deltaTone="neutral" />
      </div>

      <div className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-4 border-b">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jugador…" className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm bg-background outline-none focus:border-secondary/60" />
          </div>
          <select value={disc} onChange={(e) => setDisc(e.target.value as "all" | "basketball" | "volleyball")} className="rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="all">Todas las disciplinas</option>
            <option value="basketball">🏀 Basketball</option>
            <option value="volleyball">🏐 Voleibol</option>
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="all">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Button variant="outline" size="sm"><Filter className="size-4" /> Más filtros</Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground bg-muted/40">
              <tr>
                <th className="px-4 py-3 font-medium">Jugador</th>
                <th className="px-4 py-3 font-medium">Disciplina</th>
                <th className="px-4 py-3 font-medium">Equipo</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Último pago</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.slice(0, 30).map((p) => (
                <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={`${p.nombre} ${p.apellido}`} size={36} discipline={p.disciplina} />
                      <div>
                        <div className="font-medium">{p.nombre} {p.apellido}</div>
                        <div className="text-[11px] text-muted-foreground">#{p.jerseyNumber} · {p.edad} años · {p.posicion}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><DisciplineBadge d={p.disciplina} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{p.equipo.replace("Colina ", "")}</td>
                  <td className="px-4 py-3"><Badge tone="info">{p.categoria}</Badge></td>
                  <td className="px-4 py-3">
                    <Badge tone={p.estado === "Activo" ? "success" : p.estado === "Lesionado" ? "warning" : "primary"}>{p.estado}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs">
                      <div className="font-medium">{p.ultimoPago}</div>
                      <Badge tone={p.pago === "Al día" ? "success" : p.pago === "Pendiente" ? "warning" : "danger"} className="mt-0.5">{p.pago}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-70 hover:opacity-100 transition">
                      <button title="Ver perfil" className="p-1.5 hover:bg-muted rounded"><Eye className="size-4 text-muted-foreground" /></button>
                      <button title="Enviar email" className="p-1.5 hover:bg-muted rounded"><Mail className="size-4 text-muted-foreground" /></button>
                      <button title="Contactar apoderado" className="p-1.5 hover:bg-muted rounded"><MessageSquare className="size-4 text-muted-foreground" /></button>
                      <button title="Más" className="p-1.5 hover:bg-muted rounded"><MoreHorizontal className="size-4 text-muted-foreground" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground">
          <div>Mostrando 30 de {filtered.length}</div>
          <div className="flex gap-1">
            <button className="rounded border px-2 py-1 hover:bg-muted">Anterior</button>
            <button className="rounded border bg-muted px-2 py-1 font-medium">1</button>
            <button className="rounded border px-2 py-1 hover:bg-muted">2</button>
            <button className="rounded border px-2 py-1 hover:bg-muted">3</button>
            <button className="rounded border px-2 py-1 hover:bg-muted">Siguiente</button>
          </div>
        </div>
      </div>
    </div>
  );
}
