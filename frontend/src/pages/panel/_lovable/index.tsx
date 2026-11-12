import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Sparkles, Bell, ChevronRight, CreditCard,
  Clock, MapPin, CalendarCheck, MessageSquare, UserPlus, Megaphone,
  Bot, ArrowUpRight, PartyPopper, ClipboardList, Users, Flame,
  Download, Filter, TrendingUp, Shirt,
} from "lucide-react";
import { PageHeader, Card, Badge, Button, Avatar } from "@/components/panel/ui";
import {
  players, teams, formatCLP, entrenamientosHoy,
  actividadReciente, comunicados, pagosData, torneos, leads, iaAnalytics,
  apoderados, uniformes,
} from "./mock-data";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Dashboard — Club Colina" },
    { name: "description", content: "Panel ejecutivo de Club Colina: jugadores, pagos, leads, IA y torneos en un solo lugar." },
    { property: "og:title", content: "Dashboard — Club Colina" },
    { property: "og:description", content: "Toda la operación del club en un vistazo." },
  ]}),
  component: Dashboard,
});

const activityIcon: Record<string, { icon: typeof UserPlus; tone: string }> = {
  jugador: { icon: UserPlus, tone: "bg-secondary/10 text-secondary" },
  pago: { icon: CreditCard, tone: "bg-success/10 text-success" },
  lead: { icon: UserPlus, tone: "bg-accent/15 text-accent" },
  ia: { icon: Bot, tone: "bg-primary/10 text-primary" },
  documento: { icon: ClipboardList, tone: "bg-muted text-muted-foreground" },
  prueba: { icon: PartyPopper, tone: "bg-accent/15 text-accent" },
  comunicado: { icon: Megaphone, tone: "bg-secondary/10 text-secondary" },
  torneo: { icon: Flame, tone: "bg-accent/15 text-accent" },
};

function Dashboard() {
  const [disciplina, setDisciplina] = useState<"todas" | "basketball" | "volleyball">("todas");
  const [categoria, setCategoria] = useState<string>("todas");
  const [torneoId, setTorneoId] = useState<string>("todos");
  const [rango, setRango] = useState<"7d" | "30d" | "90d">("30d");

  const categoriasDisponibles = useMemo(() => Array.from(new Set(teams.map(t => t.category))), []);

  const filteredPlayers = useMemo(() => players.filter(p => {
    if (disciplina !== "todas" && p.disciplina !== disciplina) return false;
    if (categoria !== "todas" && p.categoria !== categoria) return false;
    return true;
  }), [disciplina, categoria]);

  const filteredPagos = useMemo(() => pagosData.filter(p => {
    if (torneoId !== "todos") return p.concepto.toLowerCase().includes("torneo");
    return true;
  }), [torneoId]);

  const pagosPendientes = filteredPagos.filter(p => p.estado === "Pendiente" || p.estado === "Atrasado");
  const totalPendiente = pagosPendientes.reduce((s, p) => s + p.monto, 0);
  const totalPagados = filteredPagos.filter(p => p.estado === "Pagado").reduce((s, p) => s + p.monto, 0);

  const torneosActivos = torneoId === "todos" ? torneos : torneos.filter(t => t.id === torneoId);
  const leadsNuevos = leads.filter(l => l.estado === "Nuevo").length;
  const uniformesPendientes = uniformes.filter(u => u.estado !== "Entregado").length;
  const uniformesRetiro = uniformes.filter(u => u.estado === "Disponible para retiro").length;

  function descargarReporte() {
    if (typeof window !== "undefined") window.print();
  }

  return (
    <div>
      <PageHeader
        title="Buenos días 👋"
        subtitle="Este es el estado general del club hoy · Miércoles 22 de julio · Club Colina"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={descargarReporte}><Download className="size-4" /> Descargar reporte</Button>
            <Button size="sm"><UserPlus className="size-4" /> Nuevo jugador</Button>
          </>
        }
      />

      {/* Filters */}
      <div className="card-surface p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground pr-2 border-r">
          <Filter className="size-3.5" /> Filtros
        </div>
        <FilterSelect label="Rango" value={rango} onChange={v => setRango(v as any)} options={[["7d", "Últimos 7 días"], ["30d", "Últimos 30 días"], ["90d", "Últimos 90 días"]]} />
        <FilterSelect label="Disciplina" value={disciplina} onChange={v => setDisciplina(v as any)} options={[["todas", "Todas las disciplinas"], ["basketball", "🏀 Basketball"], ["volleyball", "🏐 Voleibol"]]} />
        <FilterSelect label="Categoría" value={categoria} onChange={v => setCategoria(v)} options={[["todas", "Todas las categorías"], ...categoriasDisponibles.map(c => [c, c] as [string, string])]} />
        <FilterSelect label="Torneo" value={torneoId} onChange={v => setTorneoId(v)} options={[["todos", "Todos los torneos"], ...torneos.map(t => [t.id, t.nombre] as [string, string])]} />
        <div className="ml-auto text-[11px] text-muted-foreground">
          Los indicadores se actualizan al cambiar los filtros.
        </div>
      </div>

      {/* IA banner */}
      <Link to="/asistente" className="mb-6 block group">
        <div className="card-surface p-5 brand-gradient text-primary-foreground border-0 flex items-center gap-4">
          <div className="grid size-11 place-items-center rounded-xl bg-white/10 border border-white/15">
            <Sparkles className="size-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Asistente IA de Club Colina</div>
            <div className="text-sm text-white/70">Esta semana respondió {iaAnalytics.semana.conversaciones} consultas · Generó {leads.filter(l => l.origen === "Asistente IA").length} leads · Ahorro estimado {iaAnalytics.semana.tiempoAhorrado}.</div>
          </div>
          <div className="hidden sm:flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm">
            Ver analítica <ChevronRight className="size-4 group-hover:translate-x-0.5 transition" />
          </div>
        </div>
      </Link>

      {/* Executive KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MiniStat label="Jugadores activos" value={String(filteredPlayers.length)} sub="+8 este mes" icon={<Users className="size-5" />} />
        <MiniStat label="Apoderados" value={String(apoderados.length)} sub="Familias activas" icon={<UserPlus className="size-5" />} />
        <MiniStat label="Pagos recibidos" value={formatCLP(totalPagados)} sub={`${filteredPagos.filter(p => p.estado === "Pagado").length} pagos`} icon={<CreditCard className="size-5" />} />
        <MiniStat label="Pagos pendientes" value={formatCLP(totalPendiente)} sub={`${pagosPendientes.length} pendientes`} icon={<CreditCard className="size-5" />} tone="warning" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MiniStat label="Leads nuevos" value={String(leadsNuevos)} sub="Sin contactar" icon={<UserPlus className="size-5" />} tone="accent" />
        <MiniStat label="Conversaciones IA" value={String(iaAnalytics.mes.conversaciones)} sub={`${iaAnalytics.mes.tasaResolucion}% resueltas`} icon={<Bot className="size-5" />} />
        <MiniStat label="Torneos activos" value={String(torneosActivos.length)} sub="Próximos viajes" icon={<Flame className="size-5" />} tone="accent" />
        <MiniStat label="Uniformes pendientes" value={String(uniformesPendientes)} sub={`${uniformesRetiro} listos para retiro`} icon={<Shirt className="size-5" />} tone="warning" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-semibold flex items-center gap-2"><Clock className="size-4 text-secondary" /> Entrenamientos de hoy</div>
              <div className="text-xs text-muted-foreground mt-0.5">{entrenamientosHoy.length} sesiones programadas</div>
            </div>
            <span className="text-xs text-muted-foreground">Horarios fijos</span>
          </div>
          <div className="divide-y">
            {entrenamientosHoy.map(e => (
              <div key={e.id} className="py-3 flex items-center gap-4 group">
                <div className="grid size-11 place-items-center rounded-xl bg-primary/5 text-primary border border-primary/10 text-xs font-semibold leading-tight text-center">
                  {e.hora.slice(0, 5)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.equipo}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1"><MapPin className="size-3" /> {e.lugar}</span>
                    <span>Prof. {e.entrenador}</span>
                  </div>
                </div>
                <Badge tone="info">{e.jugadores} jug.</Badge>
                <ArrowUpRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="brand-gradient text-primary-foreground border-0">
            <div className="flex items-start gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-white/10 border border-white/15">
                <Flame className="size-5 text-accent" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-white/60 uppercase tracking-wide">Próximo viaje</div>
                <div className="text-sm font-semibold mt-1">{torneos[0].nombre}</div>
                <div className="text-xs text-white/70 mt-1">{torneos[0].fechaInicio} · {torneos[0].jugadores.length} deportistas</div>
                <Link to="/torneos" className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline">Ver detalle <ChevronRight className="size-3" /></Link>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold flex items-center gap-2 text-sm"><CalendarCheck className="size-4 text-secondary" /> Próximas actividades</div>
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Esta semana</span>
            </div>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-accent/10 text-accent border border-accent/20 shrink-0"><PartyPopper className="size-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug">Pruebas masivas 2026</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Sáb 27 jul · 10:00 · Complejo Deportivo</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary border border-primary/15 shrink-0"><Flame className="size-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug truncate">{torneos[0].nombre}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{torneos[0].fechaInicio} · {torneos[0].ciudad}</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-secondary/10 text-secondary border border-secondary/20 shrink-0"><Megaphone className="size-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug">Reunión de apoderados</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Vie 25 jul · 20:00 · Sala Multiuso</div>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="grid size-9 place-items-center rounded-lg bg-muted text-foreground/70 shrink-0"><Clock className="size-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug">Entrenamientos regulares</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Lun–Vie · Ver horarios por categoría</div>
                </div>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold flex items-center gap-2"><CreditCard className="size-4 text-secondary" /> Pagos pendientes</div>
            <Link to="/pagos" className="text-xs text-secondary hover:underline">Ver todos</Link>
          </div>
          <ul className="space-y-3">
            {pagosPendientes.slice(0, 5).map(p => (
              <li key={p.id} className="flex items-center gap-3">
                <Avatar name={p.jugador} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.jugador}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.concepto}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{formatCLP(p.monto)}</div>
                  <Badge tone={p.estado === "Atrasado" ? "danger" : "warning"}>{p.estado}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold flex items-center gap-2"><UserPlus className="size-4 text-accent" /> Leads recientes</div>
            <Link to="/leads" className="text-xs text-secondary hover:underline">Ver todos</Link>
          </div>
          <ul className="space-y-3">
            {leads.slice(0, 5).map(l => (
              <li key={l.id} className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-full bg-accent/10 text-accent text-xs font-semibold">
                  {l.nombre.split(" ").map(n => n[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{l.nombre}</div>
                  <div className="text-xs text-muted-foreground truncate">{l.categoria} · {l.disciplina === "basketball" ? "🏀" : "🏐"} · {l.origen}</div>
                </div>
                <Badge tone={l.estado === "Nuevo" ? "info" : l.estado === "Inscrito" ? "success" : "neutral"}>{l.estado}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="brand-gradient text-primary-foreground border-0">
          <Link to="/asistente" className="flex items-start gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-white/10 border border-white/15">
              <Bot className="size-5 text-accent" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-white/60 uppercase tracking-wide">Consultas IA hoy</div>
              <div className="text-3xl font-bold mt-1">{iaAnalytics.hoy.conversaciones}</div>
              <div className="text-xs text-white/70 mt-1">{iaAnalytics.hoy.tasaResolucion}% resueltas · Ahorro {iaAnalytics.hoy.tiempoAhorrado}</div>
            </div>
          </Link>
        </Card>
      </div>

      {/* Acceso rápido a Uniformes */}
      <Link to="/uniformes" className="mb-6 block group">
        <div className="card-surface p-5 flex items-center gap-4 card-hover">
          <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent border border-accent/20">
            <Shirt className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Uniformes</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {uniformesPendientes} pedidos activos · {uniformesRetiro} disponibles para retiro · sincronizado con el proveedor
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-xs text-secondary">
            Ver pedidos <ChevronRight className="size-4 group-hover:translate-x-0.5 transition" />
          </div>
        </div>
      </Link>


      {/* Resumen IA + Actividad reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-1 brand-gradient text-primary-foreground border-0">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="size-4 text-accent" />
            <div className="text-xs uppercase tracking-wide text-white/60">Resumen generado por IA</div>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><TrendingUp className="size-3.5 text-accent shrink-0 mt-0.5" /><span>Inscripciones creciendo <strong>+18%</strong> mes contra mes.</span></li>
            <li className="flex gap-2"><TrendingUp className="size-3.5 text-accent shrink-0 mt-0.5" /><span><strong>{leads.filter(l => l.origen === "Asistente IA").length}</strong> leads generados por IA esta semana.</span></li>
            <li className="flex gap-2"><TrendingUp className="size-3.5 text-accent shrink-0 mt-0.5" /><span>Copa Chicureo: <strong>4 apoderados</strong> aún no pagan cuota de viaje.</span></li>
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold flex items-center gap-2"><Megaphone className="size-4 text-secondary" /> Comunicados recientes</div>
            <Bell className="size-4 text-muted-foreground" />
          </div>
          <ul className="space-y-4">
            {comunicados.map(c => (
              <li key={c.id} className="pb-3 border-b last:border-0 last:pb-0">
                <div className="text-sm font-medium leading-snug">{c.titulo}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{c.fecha} · {c.autor} · {c.alcance}</div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold flex items-center gap-2"><ClipboardList className="size-4 text-primary" /> Actividad reciente</div>
            <Button variant="ghost" size="sm">Ver todo</Button>
          </div>
          <ul className="space-y-4">
            {actividadReciente.slice(0, 6).map(a => {
              const cfg = activityIcon[a.tipo] ?? activityIcon.documento;
              const Icon = cfg.icon;
              return (
                <li key={a.id} className="flex items-start gap-3">
                  <div className={`grid size-8 place-items-center rounded-full ${cfg.tone} shrink-0`}>
                    <Icon className="size-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm leading-snug">{a.texto}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{a.hace} · {a.por}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
        <MessageSquare className="size-3.5" /> ¿Necesitas algo? Pregúntale al <Link to="/asistente" className="text-secondary hover:underline">Asistente IA</Link>.
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="rounded-lg border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-secondary/60">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function MiniStat({ label, value, sub, icon, tone = "neutral" }: { label: string; value: string; sub?: string; icon?: ReactNode; tone?: "neutral" | "warning" | "accent" }) {
  const border = tone === "warning" ? "border-warning/30" : tone === "accent" ? "border-accent/30" : "";
  return (
    <div className={`card-surface p-5 card-hover ${border}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
          {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        </div>
        {icon && <div className="grid size-10 place-items-center rounded-lg bg-primary/5 text-primary">{icon}</div>}
      </div>
    </div>
  );
}
