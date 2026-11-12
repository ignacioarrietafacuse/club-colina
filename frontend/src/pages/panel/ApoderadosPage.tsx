import { ESTADOS_PERSONA } from "@club-colina/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, UserCog } from "lucide-react";
import { useState } from "react";
import { EstadoBadge } from "@/components/panel/persona";
import { nombreCompleto, TEXTO_ESTADO } from "@/components/panel/textos";
import { Badge, PageHeader } from "@/components/panel/ui";
import { useRetrasado } from "@/components/panel/useRetrasado";
import { api, mensajeDeError } from "@/lib/api";
import { filtrosApoderados, type FormFiltrosApoderados } from "./filtros";

export function ApoderadosPage() {
  const [form, setForm] = useState<FormFiltrosApoderados>({
    q: "",
    estado: "",
    faltan_datos: false,
  });
  const q = useRetrasado(form.q);
  const filtros = filtrosApoderados({ ...form, q });
  const consulta = useQuery({
    queryKey: ["panel", "apoderados", filtros],
    queryFn: ({ signal }) => api.panel.apoderados(filtros, signal),
  });
  const cambiar = (c: Partial<FormFiltrosApoderados>) => setForm((f) => ({ ...f, ...c }));

  return (
    <div>
      <PageHeader
        icon={<UserCog className="size-5" />}
        title="Apoderados"
        subtitle={consulta.data ? `${consulta.data.length} con estos filtros` : undefined}
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.faltan_datos}
              onChange={(e) => cambiar({ faltan_datos: e.target.checked })}
            />
            Faltan datos
          </label>
        </div>

        {consulta.isError ? (
          <p role="alert" className="p-5 text-sm text-destructive">
            {mensajeDeError(consulta.error)}
          </p>
        ) : consulta.isPending ? (
          <p className="p-5 text-sm text-muted-foreground">Cargando…</p>
        ) : consulta.data.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No hay apoderados con estos filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Apoderado</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Marcas</th>
                </tr>
              </thead>
              <tbody>
                {consulta.data.map((a) => (
                  <tr key={a.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        to="/apoderados/$id"
                        params={{ id: a.id }}
                        className="font-medium hover:underline"
                      >
                        {nombreCompleto(a)}
                      </Link>
                      <div className="text-xs text-muted-foreground">{a.rut}</div>
                    </td>
                    <td className="px-4 py-3">{a.telefono ?? "—"}</td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={a.estado} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {!a.tiene_foto && <Badge tone="danger">Sin foto</Badge>}
                        {a.faltan_datos && <Badge tone="warning">Faltan datos</Badge>}
                        {a.origen === "base_2026" && <Badge tone="neutral">Base 2026</Badge>}
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
