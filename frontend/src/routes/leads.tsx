import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { UserPlus, Search, Filter, Sparkles, TrendingUp, Phone, Mail, MessageSquare } from "lucide-react";
import { PageHeader, Button, Badge, StatCard, DisciplineBadge } from "@/components/app/ui";
import { leads, type Lead } from "@/lib/mock-data";

export const Route = createFileRoute("/leads")({
  head: () => ({ meta: [
    { title: "Leads — Club Colina" },
    { name: "description", content: "Nuevas familias interesadas en unirse al club, conectadas con la IA." },
    { property: "og:title", content: "Leads — Club Colina" },
    { property: "og:description", content: "Gestión de leads generados desde el Asistente IA." },
  ]}),
  component: Leads,
});

const estadoTone: Record<Lead["estado"], "info" | "warning" | "success" | "neutral" | "danger"> = {
  Nuevo: "info",
  Contactado: "warning",
  Pendiente: "warning",
  Inscrito: "success",
  Descartado: "neutral",
};

function Leads() {
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<"Todos" | Lead["estado"]>("Todos");

  const filtered = useMemo(() => leads.filter(l => {
    if (estado !== "Todos" && l.estado !== estado) return false;
    if (q && !`${l.nombre} ${l.email} ${l.telefono}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [q, estado]);

  const nuevos = leads.filter(l => l.estado === "Nuevo").length;
  const contactados = leads.filter(l => l.estado === "Contactado").length;
  const pendientes = leads.filter(l => l.estado === "Pendiente").length;
  const inscritos = leads.filter(l => l.estado === "Inscrito").length;
  const conversion = Math.round((inscritos / leads.length) * 100);

  return (
    <div>
      <PageHeader
        icon={<UserPlus className="size-5" />}
        title="Leads"
        subtitle="Familias interesadas en unirse a Club Colina · generadas por la IA"
        actions={<Button size="sm"><UserPlus className="size-4" /> Nuevo lead</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard label="Leads totales" value={String(leads.length)} delta={`+${nuevos} nuevos`} />
        <StatCard label="Nuevos" value={String(nuevos)} deltaTone="neutral" delta="sin contactar" />
        <StatCard label="Contactados" value={String(contactados)} deltaTone="neutral" />
        <StatCard label="Inscritos" value={String(inscritos)} delta="+3 este mes" />
        <StatCard label="Conversión" value={`${conversion}%`} delta="+2 pp" />
      </div>

      <div className="card-surface p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre, teléfono o email…"
            className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-secondary/60"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Filter className="size-4 text-muted-foreground" />
          {(["Todos", "Nuevo", "Contactado", "Pendiente", "Inscrito", "Descartado"] as const).map(e => (
            <button key={e} onClick={() => setEstado(e)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${estado === e ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Interés</th>
                <th className="px-4 py-3">Origen</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-muted/30 transition">
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.nombre}</div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1"><Phone className="size-3" /> {l.telefono}</span>
                      <span className="flex items-center gap-1"><Mail className="size-3" /> {l.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <DisciplineBadge d={l.disciplina} />
                      <span className="text-xs">{l.categoria}</span>
                    </div>
                    {l.notas && <div className="text-[11px] text-muted-foreground mt-1 max-w-xs truncate" title={l.notas}>{l.notas}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {l.origen === "Asistente IA" && <Sparkles className="size-3.5 text-accent" />}
                      <span className="text-xs">{l.origen}</span>
                    </div>
                    {l.conversacionId && (
                      <Link to="/asistente" className="text-[11px] text-secondary hover:underline flex items-center gap-1 mt-0.5">
                        <MessageSquare className="size-3" /> Ver conversación
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{l.fecha}</td>
                  <td className="px-4 py-3"><Badge tone={estadoTone[l.estado]}>{l.estado}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost">Contactar</Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 card-surface p-5 brand-gradient text-primary-foreground border-0">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-white/10 border border-white/15"><TrendingUp className="size-5 text-accent" /></div>
          <div>
            <div className="text-xs uppercase tracking-wide text-white/60">Insight de IA</div>
            <div className="text-sm mt-1">La IA generó <strong>{leads.filter(l => l.origen === "Asistente IA").length}</strong> leads automáticamente esta semana. La categoría <strong>U13 Voleibol</strong> es la que más consultas recibe.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
