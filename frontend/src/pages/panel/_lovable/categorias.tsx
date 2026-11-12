import { createFileRoute } from "@tanstack/react-router";
import { Trophy, Plus, Users, MapPin, Clock, CalendarDays, Phone, Mail } from "lucide-react";
import { PageHeader, Button, DisciplineBadge, StatCard } from "@/components/panel/ui";
import { teams, getResponsable } from "./mock-data";

export const Route = createFileRoute("/categorias")({
  head: () => ({ meta: [
    { title: "Categorías — Club Colina" },
    { name: "description", content: "Categorías del club: disciplina, profesor responsable y horarios de entrenamiento." },
    { property: "og:title", content: "Categorías — Club Colina" },
    { property: "og:description", content: "Información estable de cada categoría." },
  ]}),
  component: Categorias,
});

function Categorias() {
  const totalJug = teams.reduce((s, t) => s + t.players, 0);
  const basket = teams.filter(t => t.discipline === "basketball").length;
  const volley = teams.filter(t => t.discipline === "volleyball").length;

  return (
    <div>
      <PageHeader
        icon={<Trophy className="size-5" />}
        title="Categorías"
        subtitle={`${teams.length} categorías activas · Basketball y Voleibol`}
        actions={<Button size="sm"><Plus className="size-4" /> Nueva categoría</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Categorías activas" value={String(teams.length)} />
        <StatCard label="Total jugadores" value={String(totalJug)} />
        <StatCard label="Basketball" value={String(basket)} />
        <StatCard label="Voleibol" value={String(volley)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map(t => {
          const r = getResponsable(t);
          const gradient = t.discipline === "basketball"
            ? "from-primary via-primary to-accent/70"
            : "from-primary via-secondary to-secondary";
          return (
            <div key={t.id} className="card-surface overflow-hidden card-hover">
              <div className={`relative h-28 bg-gradient-to-br ${gradient} p-5 flex items-end`}>
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,.4), transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,.2), transparent 45%)" }} />
                <div className="absolute top-4 right-4 grid size-14 place-items-center rounded-2xl bg-white/15 backdrop-blur border border-white/20 text-3xl">
                  {t.discipline === "basketball" ? "🏀" : "🏐"}
                </div>
                <div className="relative text-white">
                  <div className="flex items-center gap-2 mb-1">
                    <DisciplineBadge d={t.discipline} />
                    <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium border border-white/20">{t.category}</span>
                  </div>
                  <div className="font-semibold text-lg leading-tight">{t.name.replace("Colina ", "")}</div>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">Profesor responsable</div>
                  <div className="font-medium text-sm">{r.nombre}</div>
                  {r.observaciones && <div className="text-[11px] text-muted-foreground mt-0.5">{r.observaciones}</div>}
                  <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-2"><Phone className="size-3.5" /> {r.telefono}</span>
                    <span className="flex items-center gap-2"><Mail className="size-3.5" /> {r.email}</span>
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Entrenamiento</div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="size-3.5" /> {t.players} jug.</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm"><CalendarDays className="size-3.5 text-secondary" /><span>{t.entrenamientos.dias}</span></div>
                  <div className="flex items-center gap-2 text-sm"><Clock className="size-3.5 text-secondary" /><span>{t.entrenamientos.hora}</span></div>
                  <div className="flex items-center gap-2 text-sm"><MapPin className="size-3.5 text-secondary" /><span>{t.entrenamientos.lugar}</span></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
