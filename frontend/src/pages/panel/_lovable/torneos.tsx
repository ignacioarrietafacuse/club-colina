import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Flame, Plus, MapPin, CalendarDays, Users, FileText, Phone, Mail, CheckCircle2, Clock, AlertCircle, Plane } from "lucide-react";
import { PageHeader, Button, Badge, StatCard, DisciplineBadge } from "@/components/panel/ui";
import { torneos, formatCLP, type Torneo } from "./mock-data";

export const Route = createFileRoute("/torneos")({
  head: () => ({ meta: [
    { title: "Torneos — Club Colina" },
    { name: "description", content: "Torneos, giras y viajes deportivos del club." },
    { property: "og:title", content: "Torneos — Club Colina" },
    { property: "og:description", content: "Quién viaja, quién falta por pagar y toda la documentación asociada." },
  ]}),
  component: Torneos,
});

function Torneos() {
  const [active, setActive] = useState<Torneo>(torneos[0]);
  const jugadoresTotales = torneos.reduce((s, t) => s + t.jugadores.length, 0);
  const pendientes = torneos.reduce((s, t) => s + t.jugadores.filter(j => j.pago !== "Pagado").length, 0);

  return (
    <div>
      <PageHeader
        icon={<Flame className="size-5" />}
        title="Torneos"
        subtitle="Campeonatos, giras y viajes deportivos"
        actions={<Button size="sm"><Plus className="size-4" /> Nuevo torneo</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Torneos activos" value={String(torneos.length)} />
        <StatCard label="Deportistas en viaje" value={String(jugadoresTotales)} />
        <StatCard label="Pagos pendientes" value={String(pendientes)} deltaTone="negative" />
        <StatCard label="Próximo viaje" value="Copa Chicureo" delta="14 – 17 Ago" deltaTone="neutral" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <aside className="space-y-3">
          {torneos.map(t => {
            const isActive = t.id === active.id;
            const pagados = t.jugadores.filter(j => j.pago === "Pagado").length;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t)}
                className={`w-full text-left card-surface p-4 card-hover transition ${isActive ? "border-secondary/60 shadow-md" : ""}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm leading-snug">{t.nombre}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <MapPin className="size-3" /> {t.ciudad}, {t.pais}
                    </div>
                  </div>
                  <Badge tone={t.estado === "Próximo" ? "info" : t.estado === "En curso" ? "accent" : "neutral"}>{t.estado}</Badge>
                </div>
                <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                  <CalendarDays className="size-3" />
                  <span>{t.fechaInicio} → {t.fechaTermino}</span>
                </div>
                <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1"><Users className="size-3" /> {t.jugadores.length} viajan</span>
                  <span className="text-success">{pagados}/{t.jugadores.length} pagados</span>
                </div>
              </button>
            );
          })}
        </aside>

        <div className="space-y-4">
          <div className="card-surface p-6 relative overflow-hidden">
            <div className="absolute -right-6 -top-6 grid size-32 place-items-center rounded-full brand-gradient opacity-10">
              <Plane className="size-24 text-primary" />
            </div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <DisciplineBadge d={active.disciplina} />
                <Badge tone="info">{active.estado}</Badge>
                {active.categorias.map(c => <Badge key={c} tone="primary">{c}</Badge>)}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">{active.nombre}</h2>
              <div className="mt-2 text-sm text-muted-foreground flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {active.ciudad}, {active.pais}</span>
                <span className="flex items-center gap-1.5"><CalendarDays className="size-4" /> {active.fechaInicio} → {active.fechaTermino}</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-foreground/80 max-w-3xl">{active.descripcion}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="card-surface p-5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Profesor responsable</div>
              <div className="font-medium">{active.responsable.nombre}</div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-2"><Phone className="size-3.5" /> {active.responsable.telefono}</div>
                <div className="flex items-center gap-2"><Mail className="size-3.5" /> {active.responsable.email}</div>
              </div>
            </div>
            <div className="card-surface p-5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Costo por deportista</div>
              <div className="text-2xl font-semibold">{formatCLP(active.jugadores[0]?.monto ?? 0)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Recaudado: {formatCLP(active.jugadores.filter(j => j.pago === "Pagado").reduce((s, j) => s + j.monto, 0))}
              </div>
            </div>
            <div className="card-surface p-5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Estado de pagos</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {(["Pagado", "Pendiente", "Atrasado"] as const).map(estado => {
                  const n = active.jugadores.filter(j => j.pago === estado).length;
                  const tone = estado === "Pagado" ? "text-success" : estado === "Pendiente" ? "text-warning-foreground" : "text-destructive";
                  return (
                    <div key={estado}>
                      <div className={`text-lg font-semibold ${tone}`}>{n}</div>
                      <div className="text-[10px] text-muted-foreground">{estado}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
            <div className="card-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold flex items-center gap-2"><Users className="size-4 text-secondary" /> Deportistas que viajan</div>
                <span className="text-xs text-muted-foreground">{active.jugadores.length} inscritos</span>
              </div>
              <div className="max-h-[420px] overflow-y-auto scrollbar-thin divide-y">
                {active.jugadores.map(j => {
                  const icon = j.pago === "Pagado" ? <CheckCircle2 className="size-4 text-success" />
                    : j.pago === "Pendiente" ? <Clock className="size-4 text-warning-foreground" />
                    : <AlertCircle className="size-4 text-destructive" />;
                  return (
                    <div key={j.id} className="py-2.5 flex items-center gap-3">
                      <div className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {j.nombre.split(" ").map(n => n[0]).slice(0, 2).join("")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{j.nombre}</div>
                        <div className="text-[11px] text-muted-foreground">Categoría {j.categoria}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium">{formatCLP(j.monto)}</div>
                        <div className="flex items-center justify-end gap-1 text-[11px] mt-0.5">{icon}<span>{j.pago}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card-surface p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold flex items-center gap-2"><FileText className="size-4 text-accent" /> Documentos del viaje</div>
                <Button size="sm" variant="outline">Subir</Button>
              </div>
              <ul className="space-y-2">
                {active.documentos.map(d => (
                  <li key={d.nombre} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 transition">
                    <div className="grid size-9 place-items-center rounded-lg bg-accent/10 text-accent text-[10px] font-bold">{d.tipo}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{d.nombre}</div>
                      <div className="text-[11px] text-muted-foreground">Compartido con apoderados</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
