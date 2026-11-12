import { DISCIPLINAS, ESTADOS_PERSONA } from "@club-colina/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardList, Search, Users } from "lucide-react";
import { useState } from "react";
import { EstadoBadge } from "@/components/panel/persona";
import { useRetrasado } from "@/components/panel/useRetrasado";
import {
  nombreCompleto,
  TEXTO_DISCIPLINA,
  TEXTO_ESTADO,
  textoNumero,
} from "@/components/panel/textos";
import { Badge, PageHeader } from "@/components/panel/ui";
import { api, mensajeDeError, type FiltrosJugadores } from "@/lib/api";
import { filtrosJugadores, type FormFiltrosJugadores } from "./filtros";

export function JugadoresPage() {
  const [form, setForm] = useState<FormFiltrosJugadores>({
    q: "",
    estado: "",
    disciplina: "",
    categoria_id: "",
    faltan_datos: false,
    sin_numero: false,
  });
  const q = useRetrasado(form.q);
  const filtros: FiltrosJugadores = filtrosJugadores({ ...form, q });
  const consulta = useQuery({
    queryKey: ["panel", "jugadores", filtros],
    queryFn: ({ signal }) => api.panel.jugadores(filtros, signal),
  });
  const categorias = useQuery({
    queryKey: ["panel", "categorias"],
    queryFn: ({ signal }) => api.panel.categorias(signal),
    staleTime: 5 * 60_000,
  });
  const nombreCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.nombre]));
  const cambiar = (c: Partial<FormFiltrosJugadores>) => setForm((f) => ({ ...f, ...c }));

  return (
    <div>
      <PageHeader
        icon={<Users className="size-5" />}
        title="Jugadores"
        subtitle={consulta.data ? `${consulta.data.length} con estos filtros` : undefined}
        actions={
          <Link
            to="/jugadores/solicitudes"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <ClipboardList className="size-4" /> Solicitudes de registro
          </Link>
        }
      />

      <div className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={form.q}
              onChange={(e) => cambiar({ q: e.target.value })}
              placeholder="Buscar por nombre o RUT…"
              aria-label="Buscar"
              className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-secondary/60"
            />
          </div>
          <select
            aria-label="Estado"
            value={form.estado}
            onChange={(e) => cambiar({ estado: e.target.value })}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">Todos los estados</option>
            {ESTADOS_PERSONA.map((e) => (
              <option key={e} value={e}>
                {TEXTO_ESTADO[e]}
              </option>
            ))}
          </select>
          <select
            aria-label="Disciplina"
            value={form.disciplina}
            onChange={(e) => cambiar({ disciplina: e.target.value, categoria_id: "" })}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">Todas las disciplinas</option>
            {DISCIPLINAS.map((d) => (
              <option key={d} value={d}>
                {TEXTO_DISCIPLINA[d]}
              </option>
            ))}
          </select>
          <select
            aria-label="Categoría"
            value={form.categoria_id}
            onChange={(e) => cambiar({ categoria_id: e.target.value })}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="">Todas las categorías</option>
            {(categorias.data ?? [])
              .filter((c) => !form.disciplina || c.disciplina === form.disciplina)
              .map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.nombre} · {TEXTO_DISCIPLINA[c.disciplina]}
                </option>
              ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.faltan_datos}
              onChange={(e) => cambiar({ faltan_datos: e.target.checked })}
            />
            Faltan datos
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.sin_numero}
              onChange={(e) => cambiar({ sin_numero: e.target.checked })}
            />
            Sin número (99)
          </label>
        </div>

        {categorias.isError && (
          <p role="alert" className="border-b bg-warning/15 px-4 py-2 text-sm">
            No se pudieron cargar las categorías: la columna Categoría y su filtro no se muestran
            bien.
          </p>
        )}
        {consulta.isError ? (
          <p role="alert" className="p-5 text-sm text-destructive">
            {mensajeDeError(consulta.error)}
          </p>
        ) : consulta.isPending ? (
          <p className="p-5 text-sm text-muted-foreground">Cargando…</p>
        ) : consulta.data.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No hay jugadores con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Jugador</th>
                  <th className="px-4 py-3 font-medium">Disciplina</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Número</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Marcas</th>
                </tr>
              </thead>
              <tbody>
                {consulta.data.map((j) => (
                  <tr key={j.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        to="/jugadores/$id"
                        params={{ id: j.id }}
                        className="font-medium hover:underline"
                      >
                        {nombreCompleto(j)}
                      </Link>
                      <div className="text-xs text-muted-foreground">{j.rut}</div>
                    </td>
                    <td className="px-4 py-3">{TEXTO_DISCIPLINA[j.disciplina]}</td>
                    <td className="px-4 py-3">
                      {j.categoria_id === null ? "—" : (nombreCategoria.get(j.categoria_id) ?? "—")}
                    </td>
                    <td className="px-4 py-3">{textoNumero(j.numero_camiseta)}</td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={j.estado} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {!j.tiene_foto && <Badge tone="danger">Sin foto</Badge>}
                        {j.faltan_datos && <Badge tone="warning">Faltan datos</Badge>}
                        {j.marcado_retiro_en && <Badge tone="danger">Ya no está</Badge>}
                        {j.origen === "base_2026" && <Badge tone="neutral">Base 2026</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
