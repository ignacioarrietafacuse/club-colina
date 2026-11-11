import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Send, Plus, MessageSquare, Zap, Bot, Paperclip, BarChart3, TrendingUp, Users, Clock } from "lucide-react";
import { PageHeader, Card, Badge } from "@/components/app/ui";
import { conversacionesIA, iaAnalytics, type Conversation } from "@/lib/mock-data";

export const Route = createFileRoute("/asistente")({
  head: () => ({ meta: [
    { title: "IA y Conversaciones — Club Colina" },
    { name: "description", content: "Asistente IA del club, con analítica de conversaciones y detección automática de dudas frecuentes." },
    { property: "og:title", content: "IA y Conversaciones — Club Colina" },
    { property: "og:description", content: "Analiza y responde consultas de apoderados y jugadores." },
  ]}),
  component: IAyConversaciones,
});

type Msg = { role: "user" | "assistant"; content: string };

const suggestions = [
  "¿Cuáles son los horarios de entrenamiento?",
  "¿Cuánto cuesta la mensualidad?",
  "¿Cómo inscribo a mi hijo?",
  "¿Cómo va mi uniforme?",
  "¿Ya llegó mi uniforme?",
  "¿Qué talla quedó registrada?",
  "¿Dónde está el reglamento?",
];

const cannedExtra: Record<string, string> = {
  "¿Cuáles son los horarios de entrenamiento?": "Los horarios fijos son:\n\n**Basketball**\n• U13 — Martes y jueves 17:00 – 18:30\n• U15 — Lunes, miércoles y viernes 18:00 – 19:30\n• U17 — Martes y jueves 19:00 – 20:30\n• Adulto — Lunes y miércoles 20:30 – 22:00\n\n**Voleibol**\n• U13 F — Martes y jueves 17:30 – 19:00\n• U15 F — Lunes, miércoles y viernes 18:30 – 20:00\n• U17 F — Martes y jueves 19:30 – 21:00\n• Adulto — Lunes y miércoles 21:00 – 22:30",
  "¿Cuánto cuesta la mensualidad?": "La **mensualidad 2026** es de **$45.000 CLP**. Incluye entrenamientos regulares, seguro deportivo y preparación física. Familias con **2 o más hijos** tienen 15% de descuento a partir del segundo.",
  "¿Cómo inscribo a mi hijo?": "El proceso de inscripción es 100% digital:\n\n1. Ir a **Jugadores → Nuevo jugador**\n2. Completar los datos del deportista y del apoderado\n3. Subir la ficha médica (formato en Documentos)\n4. Realizar el pago de inscripción ($120.000 CLP)\n\nRecibirás el contrato y credencial digital por correo.",
  "¿Cómo va mi uniforme?": "Consultando el módulo de **Uniformes**:\n\n• Prenda: Camiseta oficial\n• Talla registrada: **M** · dorsal 12\n• Estado actual: **En producción** (proveedor externo)\n• Fecha del pedido: 12 de junio\n• Fecha estimada: **8 de agosto**\n• Última actualización: hoy\n\nTe aviso automáticamente cuando quede *Disponible para retiro*.",
  "¿Ya llegó mi uniforme?": "Sí. El pedido está **Disponible para retiro** en la oficina del club desde hoy.\n\nHorario de retiro: **lunes a viernes de 10:00 a 19:00** y sábados de 10:00 a 13:00.",
  "¿Qué talla quedó registrada?": "La talla registrada en el pedido es **M** (camiseta y short). Mientras el estado siga en *En producción* aún es posible solicitar un cambio de talla al proveedor.",
  "¿Cuándo estará listo?": "Según el módulo de **Uniformes**, la fecha estimada de entrega del pedido es el **8 de agosto**. Hoy está **En producción** y la última actualización del proveedor fue hoy.",
  "¿Dónde está el reglamento?": "El **Reglamento Interno 2026** está en **Documentos → Legal** (PDF, 1.2 MB). Última actualización: 15 de marzo de 2026.",
};

function IAyConversaciones() {
  const [tab, setTab] = useState<"chat" | "analitica">("chat");
  return (
    <div>
      <PageHeader
        icon={<Sparkles className="size-5" />}
        title="IA y Conversaciones"
        subtitle="Todas las consultas del club en un solo lugar · con analítica automática"
        actions={
          <div className="inline-flex rounded-lg border bg-card p-1">
            <button onClick={() => setTab("chat")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === "chat" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <MessageSquare className="size-3.5 inline mr-1.5" /> Conversaciones
            </button>
            <button onClick={() => setTab("analitica")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${tab === "analitica" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <BarChart3 className="size-3.5 inline mr-1.5" /> Analítica
            </button>
          </div>
        }
      />

      {tab === "chat" ? <ChatView /> : <AnalyticsView />}
    </div>
  );
}

function ChatView() {
  const [active, setActive] = useState<Conversation>(conversacionesIA[0]);
  const [threadMessages, setThreadMessages] = useState<Record<string, Msg[]>>(
    Object.fromEntries(conversacionesIA.map(c => [c.id, c.mensajes as Msg[]]))
  );
  const [input, setInput] = useState("");

  const messages = threadMessages[active.id] ?? [];

  function send(text: string) {
    if (!text.trim()) return;
    const answer = cannedExtra[text] ?? "Estoy revisando esa información en tiempo real desde los datos del club. En unos segundos tendré una respuesta precisa para ti.";
    setThreadMessages(m => ({
      ...m,
      [active.id]: [...(m[active.id] ?? []), { role: "user", content: text }, { role: "assistant", content: answer }],
    }));
    setInput("");
  }

  function newConversation() {
    const id = `cv-new-${Date.now()}`;
    const conv: Conversation = { id, titulo: "Nueva conversación", cuando: "hoy", mensajes: [{ role: "assistant", content: "¡Hola! Soy el **Asistente IA de Club Colina**. ¿En qué te ayudo hoy?" }] };
    conversacionesIA.unshift(conv);
    setThreadMessages(m => ({ ...m, [id]: conv.mensajes as Msg[] }));
    setActive(conv);
  }

  const hoy = conversacionesIA.filter(c => c.cuando === "hoy");
  const ayer = conversacionesIA.filter(c => c.cuando === "ayer");
  const antes = conversacionesIA.filter(c => c.cuando !== "hoy" && c.cuando !== "ayer");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 h-[calc(100vh-12rem)]">
      <aside className="hidden lg:flex flex-col card-surface p-4">
        <button onClick={newConversation} className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium mb-4 hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 transition">
          <Plus className="size-4" /> Nueva conversación
        </button>
        <ThreadGroup label="Hoy" items={hoy} activeId={active.id} onPick={setActive} />
        {ayer.length > 0 && <ThreadGroup label="Ayer" items={ayer} activeId={active.id} onPick={setActive} />}
        {antes.length > 0 && <ThreadGroup label="Anteriores" items={antes} activeId={active.id} onPick={setActive} />}
        <div className="mt-auto rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 mb-1 text-foreground font-medium"><Zap className="size-3.5 text-accent" /> Powered by IA</div>
          Conectado a los datos del club: jugadores, pagos, categorías, torneos, uniformes y documentación institucional.
        </div>
      </aside>

      <div className="flex flex-col card-surface overflow-hidden">
        <div className="flex items-center gap-3 border-b px-5 py-4">
          <div className="grid size-10 place-items-center rounded-xl brand-gradient text-primary-foreground">
            <Sparkles className="size-4 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{active.titulo}</div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-success" /> En línea · Asistente IA de Club Colina
            </div>
          </div>
          <div className="text-[11px] text-muted-foreground hidden sm:block">Modelo Colina</div>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 space-y-5">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 animate-in-up ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "assistant" && (
                <div className="grid size-8 shrink-0 place-items-center rounded-full brand-gradient text-primary-foreground"><Bot className="size-4" /></div>
              )}
              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-muted rounded-tl-sm"
              }`}>
                {renderMd(m.content)}
              </div>
              {m.role === "user" && (
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground text-xs font-semibold">AP</div>
              )}
            </div>
          ))}

          {messages.length <= 1 && (
            <div className="pt-4">
              <div className="text-xs font-medium text-muted-foreground mb-3">SUGERENCIAS</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left rounded-xl border px-4 py-3 text-sm hover:border-secondary/60 hover:bg-secondary/5 transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="flex items-end gap-2 rounded-2xl border bg-background px-3 py-2 focus-within:border-secondary/60 focus-within:shadow-sm transition"
          >
            <button type="button" className="p-2 text-muted-foreground hover:text-foreground"><Paperclip className="size-4" /></button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pregúntame sobre horarios, inscripciones, pagos, uniformes, torneos…"
              rows={1}
              className="flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            />
            <button type="submit" className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20 transition">
              <Send className="size-4" />
            </button>
          </form>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground px-1">
            <div>Respuestas basadas en datos reales del club</div>
            <div>Enter para enviar · Shift+Enter para salto de línea</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsView() {
  const [range, setRange] = useState<"hoy" | "semana" | "mes">("semana");
  const stats = iaAnalytics[range];
  const maxN = Math.max(...iaAnalytics.evolucion.map(e => e.n));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-muted-foreground">Resumen del período</div>
        <div className="inline-flex rounded-lg border bg-card p-1">
          {(["hoy", "semana", "mes"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {r === "hoy" ? "Hoy" : r === "semana" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={<MessageSquare className="size-5" />} label="Conversaciones" value={String(stats.conversaciones)} sub="mensajes IA" />
        <MetricCard icon={<Users className="size-5" />} label="Usuarios únicos" value={String(stats.usuariosUnicos)} sub="apoderados / jugadores" />
        <MetricCard icon={<TrendingUp className="size-5" />} label="Tasa de resolución" value={`${stats.tasaResolucion}%`} sub="1er intento" />
        <MetricCard icon={<Clock className="size-5" />} label="Tiempo ahorrado" value={stats.tiempoAhorrado} sub="staff administrativo" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="font-semibold">Evolución semanal</div>
            <Badge tone="info">Últimos 7 días</Badge>
          </div>
          <div className="flex items-end gap-3 h-40">
            {iaAnalytics.evolucion.map(e => (
              <div key={e.dia} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full rounded-t-md brand-gradient transition-all hover:opacity-90" style={{ height: `${(e.n / maxN) * 100}%` }} title={`${e.n} conversaciones`} />
                <div className="text-[11px] text-muted-foreground">{e.dia}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="font-semibold mb-4">Temas más consultados</div>
          <div className="space-y-3">
            {iaAnalytics.temas.map(t => (
              <div key={t.tema}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium">{t.tema}</span>
                  <span className="text-muted-foreground">{t.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full brand-gradient" style={{ width: `${t.pct * 3}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="font-semibold">Preguntas más frecuentes</div>
          <div className="text-xs text-muted-foreground">Detectadas automáticamente por la IA</div>
        </div>
        <div className="divide-y">
          {iaAnalytics.preguntasFrecuentes.map((p, i) => (
            <div key={p.pregunta} className="py-3 flex items-center gap-4">
              <div className="grid size-8 place-items-center rounded-lg bg-primary/5 text-primary text-xs font-semibold">{i + 1}</div>
              <div className="flex-1 text-sm">{p.pregunta}</div>
              <div className="text-xs text-muted-foreground">{p.veces} veces</div>
              <Badge tone={p.tendencia.startsWith("+") ? "success" : "neutral"}>{p.tendencia}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="brand-gradient text-primary-foreground border-0">
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-white/10 border border-white/15 shrink-0"><Sparkles className="size-5 text-accent" /></div>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-white/60 mb-2">Análisis generado por IA</div>
            <ul className="space-y-2 text-sm">
              {iaAnalytics.insights.map((ins, i) => (
                <li key={i} className="flex gap-2"><span className="text-accent">▸</span><span>{renderMd(ins)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="card-surface p-5 card-hover">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-semibold">{value}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
        </div>
        <div className="grid size-10 place-items-center rounded-lg bg-primary/5 text-primary">{icon}</div>
      </div>
    </div>
  );
}

function ThreadGroup({ label, items, activeId, onPick }: { label: string; items: Conversation[]; activeId: string; onPick: (c: Conversation) => void }) {
  return (
    <>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 px-1 mt-2">{label}</div>
      <ul className="space-y-1 mb-3">
        {items.map(c => (
          <li key={c.id}>
            <button
              onClick={() => onPick(c)}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition ${
                activeId === c.id ? "bg-muted font-medium text-foreground" : "hover:bg-muted/60 text-muted-foreground"
              }`}
            >
              <MessageSquare className="size-3.5 text-muted-foreground" />
              <span className="truncate">{c.titulo}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function renderMd(text: string): React.ReactNode {
  const lines = text.split("\n");
  return (
    <div className="leading-relaxed space-y-2">
      {lines.map((line, i) => {
        if (line.trim().startsWith("• ") || line.trim().startsWith("* ")) {
          return <div key={i} className="flex gap-2 pl-1"><span>•</span><span>{renderInline(line.replace(/^[\s]*[•*]\s/, ""))}</span></div>;
        }
        if (/^\d+\.\s/.test(line.trim())) {
          return <div key={i} className="flex gap-2 pl-1"><span className="text-muted-foreground">{line.trim().split(".")[0]}.</span><span>{renderInline(line.replace(/^\d+\.\s/, ""))}</span></div>;
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <div key={i}>{renderInline(line)}</div>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>
  );
}
