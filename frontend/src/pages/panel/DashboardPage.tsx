import type { DashboardResponse } from "@club-colina/shared";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardList, IdCard, UserCog, UserMinus, UserRoundX, Users } from "lucide-react";
import type { ReactNode } from "react";
import { EtiquetaPendiente } from "@/components/panel/Pendiente";
import { PageHeader } from "@/components/panel/ui";
import { TEXTO_DISCIPLINA } from "@/components/panel/textos";
import { api, mensajeDeError } from "@/lib/api";
import { filasPorCategoria, INDICADORES_ETAPA_2, saludo } from "./dashboard";

export const CLAVE_DASHBOARD = ["panel", "dashboard"] as const;

export function DashboardPage() {
  const consulta = useQuery({
    queryKey: CLAVE_DASHBOARD,
    queryFn: ({ signal }) => api.panel.dashboard(signal),
  });
  const categorias = useQuery({
    queryKey: ["panel", "categorias"],
    queryFn: ({ signal }) => api.panel.categorias(signal),
    staleTime: 5 * 60_000,
  });

  return (
    <div>
      <PageHeader
        title={saludo(new Date().getHours())}
        subtitle="Este es el estado general del club."
      />
      {consulta.isError ? (
        <p role="alert" className="card-surface p-5 text-sm text-destructive">
          {mensajeDeError(consulta.error)}
        </p>
      ) : (
        <>
          <IndicadoresEtapa1 datos={consulta.data} />
          {consulta.data && (
            <PorCategoria
              filas={filasPorCategoria(consulta.data.jugadores_por_categoria, categorias.data)}
            />
          )}
        </>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-muted-foreground">Próximamente</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {INDICADORES_ETAPA_2.map((nombre) => (
          <div key={nombre} className="card-surface p-5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {nombre}
            </div>
            <div className="mt-3">
              <EtiquetaPendiente />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Con `datos` sin cargar muestra "…": nunca un número inventado. */
export function IndicadoresEtapa1({ datos }: { datos: DashboardResponse | undefined }) {
  const n = (valor: number | undefined) => (valor === undefined ? "…" : String(valor));
  const precargados = datos
    ? datos.precargados_sin_registrar.jugadores + datos.precargados_sin_registrar.apoderados
    : undefined;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      <Indicador
        etiqueta="Jugadores activos"
        valor={n(datos?.jugadores_activos)}
        icono={<Users className="size-5" />}
        enlace={<Link to="/jugadores">Ver jugadores</Link>}
      />
      <Indicador
        etiqueta="Apoderados registrados"
        valor={n(datos?.apoderados_activos)}
        icono={<UserCog className="size-5" />}
        enlace={<Link to="/apoderados">Ver apoderados</Link>}
      />
      <Indicador
        etiqueta="Entrenadores"
        valor={n(datos?.entrenadores_activos)}
        icono={<IdCard className="size-5" />}
        enlace={<Link to="/entrenadores">Ver entrenadores</Link>}
      />
      <Indicador
        etiqueta="Solicitudes pendientes"
        valor={n(datos?.solicitudes_pendientes)}
        icono={<ClipboardList className="size-5" />}
        destacado={(datos?.solicitudes_pendientes ?? 0) > 0}
        enlace={<Link to="/jugadores/solicitudes">Revisar solicitudes</Link>}
      />
      <Indicador
        etiqueta='Marcados "ya no está"'
        valor={n(datos?.jugadores_marcados_ya_no_esta)}
        icono={<UserMinus className="size-5" />}
        destacado={(datos?.jugadores_marcados_ya_no_esta ?? 0) > 0}
        detalle="Déjalos inactivos o quita la marca en su ficha"
        enlace={
          <Link to="/jugadores" search={{ marcados: true }}>
            Ver marcados
          </Link>
        }
      />
      <Indicador
        etiqueta="Precargados sin registrarse"
        valor={n(precargados)}
        icono={<UserRoundX className="size-5" />}
        detalle={
          datos
            ? `${datos.precargados_sin_registrar.jugadores} jugadores · ${datos.precargados_sin_registrar.apoderados} apoderados`
            : undefined
        }
      />
    </div>
  );
}

/** Jugadores activos por categoría, calculada hoy: la categoría cambia sola el 1 de enero. */
function PorCategoria({ filas }: { filas: ReturnType<typeof filasPorCategoria> }) {
  if (filas.length === 0) return null;
  return (
    <>
      <h2 className="mt-8 mb-3 text-sm font-semibold text-muted-foreground">
        Jugadores activos por categoría
      </h2>
      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Rama</th>
              <th className="px-4 py-2 font-medium">Categoría</th>
              <th className="px-4 py-2 text-right font-medium">Jugadores</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className="border-t">
                <td className="px-4 py-2">{f.disciplina ? TEXTO_DISCIPLINA[f.disciplina] : "—"}</td>
                <td className="px-4 py-2">{f.nombre}</td>
                <td className="px-4 py-2 text-right tabular-nums">{f.jugadores}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Indicador({
  etiqueta,
  valor,
  icono,
  enlace,
  detalle,
  destacado = false,
}: {
  etiqueta: string;
  valor: string;
  icono: ReactNode;
  enlace?: ReactNode;
  detalle?: string;
  destacado?: boolean;
}) {
  return (
    <div className={`card-surface p-5 ${destacado ? "ring-2 ring-accent/40" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {etiqueta}
          </div>
          <div className="mt-2 text-2xl font-semibold">{valor}</div>
        </div>
        <div className="grid size-10 place-items-center rounded-lg bg-primary/5 text-primary">
          {icono}
        </div>
      </div>
      {detalle && <div className="mt-2 text-xs text-muted-foreground">{detalle}</div>}
      {enlace && (
        <div className="mt-3 text-xs font-medium text-secondary hover:underline">{enlace}</div>
      )}
    </div>
  );
}
