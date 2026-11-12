import type { SolicitudResumen } from "@club-colina/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, ClipboardList } from "lucide-react";
import { useState } from "react";
import { TEXTO_AVISO, textoFechaHora } from "@/components/panel/textos";
import { Badge, PageHeader } from "@/components/panel/ui";
import { api, mensajeDeError, type FiltrosSolicitudes } from "@/lib/api";

type Filtro = "pendiente" | "revisada" | "todas";

export function SolicitudesPage() {
  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  const filtros: FiltrosSolicitudes = filtro === "todas" ? {} : { estado: filtro };
  const consulta = useQuery({
    queryKey: ["panel", "solicitudes", filtros],
    queryFn: ({ signal }) => api.panel.solicitudes(filtros, signal),
  });

  return (
    <div>
      <Link
        to="/jugadores"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Jugadores
      </Link>
      <PageHeader
        icon={<ClipboardList className="size-5" />}
        title="Solicitudes de registro"
        subtitle="Lo que llega por el formulario. Nada queda activo hasta que se aprueba."
      />

      <div className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <label className="text-xs text-muted-foreground" htmlFor="filtro-solicitudes">
            Mostrar
          </label>
          <select
            id="filtro-solicitudes"
            value={filtro}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "pendiente" || v === "revisada" || v === "todas") setFiltro(v);
            }}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          >
            <option value="pendiente">Pendientes</option>
            <option value="revisada">Revisadas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        {consulta.isError ? (
          <p role="alert" className="p-5 text-sm text-destructive">
            {mensajeDeError(consulta.error)}
          </p>
        ) : consulta.isPending ? (
          <p className="p-5 text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <TablaSolicitudes solicitudes={consulta.data} />
        )}
      </div>
    </div>
  );
}

export function TablaSolicitudes({ solicitudes }: { solicitudes: SolicitudResumen[] }) {
  if (!solicitudes.length) {
    return <p className="p-5 text-sm text-muted-foreground">No hay solicitudes.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Recibida</th>
            <th className="px-4 py-3 font-medium">Quién llenó</th>
            <th className="px-4 py-3 font-medium">Por revisar</th>
            <th className="px-4 py-3 font-medium">Marcas</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {solicitudes.map((s) => (
            <tr key={s.id} className="border-t align-top hover:bg-muted/30">
              <td className="whitespace-nowrap px-4 py-3">{textoFechaHora(s.creada_en)}</td>
              <td className="px-4 py-3">
                <div className="font-medium">{s.titular.nombre_completo}</div>
                <div className="text-xs text-muted-foreground">
                  {s.titular.rol === "apoderado" ? "Apoderado" : "Jugador adulto"}
                  {s.tipo === "segundo_apoderado" ? " · Segundo apoderado" : ""}
                </div>
              </td>
              <td className="px-4 py-3">
                {s.estado === "revisada" ? (
                  <Badge tone="neutral">Revisada</Badge>
                ) : (
                  <Badge tone="warning">
                    {s.personas_pendientes} {s.personas_pendientes === 1 ? "persona" : "personas"}
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {s.coincide_base && <Badge tone="info">Coincide con la base</Badge>}
                  {s.avisos.length > 0 && (
                    <span title={s.avisos.map((a) => TEXTO_AVISO[a]).join("\n")}>
                      <Badge tone="danger">
                        <AlertTriangle className="size-3" />
                        {s.avisos.length === 1 ? "1 aviso" : `${s.avisos.length} avisos`}
                      </Badge>
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  to="/jugadores/solicitudes/$id"
                  params={{ id: s.id }}
                  className="text-xs font-medium text-secondary hover:underline"
                >
                  Revisar
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
