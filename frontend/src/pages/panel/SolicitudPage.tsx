import {
  METODOS_PAGO,
  NUMERO_SIN_ASIGNAR,
  type ApoderadoDetalle,
  type CategoriaPanel,
  type JugadorDetalle,
  type MetodoPago,
  type SolicitudDetalle,
} from "@club-colina/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, Check, Copy, Link2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { EstadoBadge, FotoPersona } from "@/components/panel/persona";
import {
  nombreCompleto,
  TEXTO_AVISO,
  TEXTO_DISCIPLINA,
  TEXTO_METODO_PAGO,
  textoFecha,
  textoFechaHora,
} from "@/components/panel/textos";
import { Badge, Button, PageHeader } from "@/components/panel/ui";
import { api, mensajeDeError } from "@/lib/api";
import {
  armarAprobacion,
  armarRechazo,
  formInicial,
  llaveVinculo,
  type FormAprobacion,
  type FormJugador,
} from "./aprobacion";

export function SolicitudPage() {
  const { id } = useParams({ from: "/_panel/jugadores/solicitudes/$id" });
  const consulta = useQuery({
    queryKey: ["panel", "solicitud", id],
    queryFn: ({ signal }) => api.panel.solicitud(id, signal),
  });
  const categorias = useQuery({
    queryKey: ["panel", "categorias"],
    queryFn: ({ signal }) => api.panel.categorias(signal),
    staleTime: 5 * 60_000,
  });

  return (
    <div>
      <Link
        to="/jugadores/solicitudes"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Solicitudes
      </Link>
      {consulta.isError ? (
        <p role="alert" className="card-surface p-5 text-sm text-destructive">
          {mensajeDeError(consulta.error)}
        </p>
      ) : consulta.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <DetalleSolicitud s={consulta.data} categorias={categorias.data ?? []} />
      )}
    </div>
  );
}

function DetalleSolicitud({
  s,
  categorias,
}: {
  s: SolicitudDetalle;
  categorias: CategoriaPanel[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormAprobacion>(() => formInicial(s));
  const [errores, setErrores] = useState<string[]>([]);
  const [confirmarRechazo, setConfirmarRechazo] = useState(false);

  // Cuando llega el detalle actualizado (después de aprobar o rechazar), el formulario se rehace.
  useEffect(() => {
    setForm(formInicial(s));
  }, [s]);

  const nombres: Record<string, string> = Object.fromEntries(
    [...s.jugadores, ...s.apoderados].map((p) => [p.id, nombreCompleto(p)]),
  );

  const refrescar = async () => {
    await queryClient.invalidateQueries({ queryKey: ["panel"] });
  };

  const aprobar = useMutation({
    mutationFn: (datos: Parameters<typeof api.panel.aprobarSolicitud>[1]) =>
      api.panel.aprobarSolicitud(s.id, datos),
    onSuccess: async (detalle) => {
      queryClient.setQueryData(["panel", "solicitud", s.id], detalle);
      await refrescar();
    },
  });
  const rechazar = useMutation({
    mutationFn: (datos: Parameters<typeof api.panel.rechazarSolicitud>[1]) =>
      api.panel.rechazarSolicitud(s.id, datos),
    onSuccess: refrescar,
  });

  const hayPendientes =
    Object.keys(form.jugadores).length +
      Object.keys(form.apoderados).length +
      Object.keys(form.vinculos).length >
    0;
  const ocupado = aprobar.isPending || rechazar.isPending;

  function enviarAprobacion() {
    setConfirmarRechazo(false);
    const r = armarAprobacion(form, nombres);
    if (!r.ok) return setErrores(r.errores);
    setErrores([]);
    aprobar.mutate(r.datos);
  }
  function enviarRechazo() {
    const r = armarRechazo(form);
    if (!r.ok) return setErrores(r.errores);
    setErrores([]);
    if (!confirmarRechazo) return setConfirmarRechazo(true);
    setConfirmarRechazo(false);
    rechazar.mutate(r.datos);
  }

  const errorServidor = aprobar.error ?? rechazar.error;

  return (
    <div>
      <PageHeader
        title={`Solicitud del ${textoFechaHora(s.creada_en)}`}
        subtitle={
          s.tipo === "segundo_apoderado"
            ? "Segundo apoderado agregado por otro apoderado."
            : "Formulario de registro."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {s.coincide_base && <Badge tone="info">Coincide con la base</Badge>}
            <Badge tone={s.estado === "pendiente" ? "warning" : "neutral"}>
              {s.estado === "pendiente" ? "Pendiente" : "Revisada"}
            </Badge>
          </div>
        }
      />

      {s.avisos.length > 0 && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" /> Revisa antes de aprobar
          </div>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
            {s.avisos.map((a) => (
              <li key={a}>{TEXTO_AVISO[a]}</li>
            ))}
          </ul>
        </div>
      )}

      <Seccion titulo="Apoderados">
        {s.apoderados.length === 0 && <Vacio />}
        {s.apoderados.map((a) => (
          <TarjetaApoderado
            key={a.id}
            a={a}
            form={form.apoderados[a.id]}
            onChange={(cambio) =>
              setForm((f) => {
                const actual = f.apoderados[a.id];
                if (!actual) return f;
                return { ...f, apoderados: { ...f.apoderados, [a.id]: { ...actual, ...cambio } } };
              })
            }
          />
        ))}
      </Seccion>

      <Seccion titulo="Jugadores">
        {s.jugadores.length === 0 && <Vacio />}
        {s.jugadores.map((j) => (
          <TarjetaJugador
            key={j.id}
            j={j}
            categorias={categorias.filter((c) => c.disciplina === j.disciplina)}
            form={form.jugadores[j.id]}
            onChange={(cambio) =>
              setForm((f) => {
                const actual = f.jugadores[j.id];
                if (!actual) return f;
                return { ...f, jugadores: { ...f.jugadores, [j.id]: { ...actual, ...cambio } } };
              })
            }
          />
        ))}
      </Seccion>

      {s.vinculos.length > 0 && (
        <Seccion titulo="Vínculos apoderado–jugador">
          <div className="card-surface divide-y">
            {s.vinculos.map((v) => {
              const llave = llaveVinculo(v);
              const pendiente = llave in form.vinculos;
              return (
                <label key={llave} className="flex items-center gap-3 px-4 py-3 text-sm">
                  {pendiente ? (
                    <input
                      type="checkbox"
                      checked={form.vinculos[llave] ?? false}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          vinculos: { ...f.vinculos, [llave]: e.target.checked },
                        }))
                      }
                    />
                  ) : (
                    <Check className="size-4 text-success" />
                  )}
                  <span className="flex-1">
                    {nombres[v.apoderado_id] ?? "Apoderado de otra solicitud"} →{" "}
                    {nombres[v.jugador_id] ?? "Jugador de otra solicitud"}
                    {v.paga_mensualidad && (
                      <span className="text-muted-foreground"> · paga la mensualidad</span>
                    )}
                  </span>
                  <Badge tone={v.estado === "activo" ? "success" : "warning"}>
                    {v.estado === "activo" ? "Activo" : "Pendiente"}
                  </Badge>
                </label>
              );
            })}
          </div>
        </Seccion>
      )}

      {(errores.length > 0 || errorServidor) && (
        <div
          role="alert"
          className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errores.map((e) => (
            <div key={e}>{e}</div>
          ))}
          {errores.length === 0 && errorServidor && mensajeDeError(errorServidor)}
        </div>
      )}

      {hayPendientes ? (
        <div className="card-surface flex flex-wrap items-center gap-3 p-4">
          <p className="flex-1 text-sm text-muted-foreground">
            Se aprueba o rechaza solo lo marcado. Lo que quede sin marcar sigue pendiente.
          </p>
          <Button variant="outline" onClick={enviarRechazo} disabled={ocupado}>
            <X className="size-4" />
            {confirmarRechazo ? "Confirmar rechazo de lo marcado" : "Rechazar lo marcado"}
          </Button>
          <Button onClick={enviarAprobacion} disabled={ocupado}>
            <Check className="size-4" />
            {aprobar.isPending ? "Aprobando…" : "Aprobar lo marcado"}
          </Button>
        </div>
      ) : (
        <p className="card-surface p-4 text-sm text-muted-foreground">
          No queda nada pendiente en esta solicitud.
        </p>
      )}

      <LinkPrivado solicitudId={s.id} />
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{titulo}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Vacio() {
  return <p className="text-sm text-muted-foreground">Ninguno en esta solicitud.</p>;
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{etiqueta}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function SelectMetodoPago({
  valor,
  onChange,
  id,
}: {
  valor: MetodoPago | "";
  onChange: (v: MetodoPago | "") => void;
  id: string;
}) {
  return (
    <select
      id={id}
      value={valor}
      onChange={(e) => {
        const v = METODOS_PAGO.find((m) => m === e.target.value);
        onChange(v ?? "");
      }}
      className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
    >
      <option value="">Sin definir</option>
      {METODOS_PAGO.map((m) => (
        <option key={m} value={m}>
          {TEXTO_METODO_PAGO[m]}
        </option>
      ))}
    </select>
  );
}

function Marcar({
  marcado,
  onChange,
  etiqueta,
}: {
  marcado: boolean;
  onChange: (v: boolean) => void;
  etiqueta: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      {etiqueta}
    </label>
  );
}

function TarjetaApoderado({
  a,
  form,
  onChange,
}: {
  a: ApoderadoDetalle;
  form: { marcado: boolean; metodo_pago: MetodoPago | "" } | undefined;
  onChange: (c: Partial<{ marcado: boolean; metodo_pago: MetodoPago | "" }>) => void;
}) {
  return (
    <div className="card-surface flex flex-wrap gap-4 p-4">
      <FotoPersona tipo="apoderados" id={a.id} tieneFoto={a.tiene_foto} tamano={96} />
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-2">
          <Link
            to="/apoderados/$id"
            params={{ id: a.id }}
            className="font-semibold hover:underline"
          >
            {nombreCompleto(a)}
          </Link>
          <EstadoBadge estado={a.estado} />
          {!a.tiene_foto && <Badge tone="danger">Sin foto</Badge>}
        </div>
        <Dato etiqueta="RUT">{a.rut}</Dato>
        <Dato etiqueta="Teléfono">{a.telefono ?? "—"}</Dato>
        <Dato etiqueta="Correo">{a.email ?? "—"}</Dato>
        <div>
          <label
            className="text-[11px] uppercase tracking-wide text-muted-foreground"
            htmlFor={`mp-${a.id}`}
          >
            Método de pago
          </label>
          {form ? (
            <SelectMetodoPago
              id={`mp-${a.id}`}
              valor={form.metodo_pago}
              onChange={(v) => onChange({ metodo_pago: v })}
            />
          ) : (
            <div className="text-sm">{a.metodo_pago ? TEXTO_METODO_PAGO[a.metodo_pago] : "—"}</div>
          )}
        </div>
        {form && (
          <div className="col-span-2 sm:col-span-4">
            <Marcar
              marcado={form.marcado}
              onChange={(v) => onChange({ marcado: v })}
              etiqueta="Marcar para aprobar o rechazar"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function CampoNumero({
  id,
  etiqueta,
  valor,
  onChange,
  sufijo,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  sufijo?: string;
}) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground" htmlFor={id}>
        {etiqueta}
      </label>
      <div className="flex items-center gap-1">
        <input
          id={id}
          inputMode="numeric"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
        />
        {sufijo && <span className="text-xs text-muted-foreground">{sufijo}</span>}
      </div>
    </div>
  );
}

function TarjetaJugador({
  j,
  categorias,
  form,
  onChange,
}: {
  j: JugadorDetalle;
  categorias: CategoriaPanel[];
  form: FormJugador | undefined;
  onChange: (c: Partial<FormJugador>) => void;
}) {
  const nombreCategoria = categorias.find((c) => c.id === j.categoria_id)?.nombre;
  return (
    <div className="card-surface flex flex-wrap gap-4 p-4">
      <FotoPersona tipo="jugadores" id={j.id} tieneFoto={j.tiene_foto} tamano={96} />
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-2">
          <Link to="/jugadores/$id" params={{ id: j.id }} className="font-semibold hover:underline">
            {nombreCompleto(j)}
          </Link>
          <EstadoBadge estado={j.estado} />
          {!j.tiene_foto && <Badge tone="danger">Sin foto</Badge>}
          {j.postula_beca && <Badge tone="accent">Postula a beca</Badge>}
          {j.marcado_retiro_en && <Badge tone="danger">Marcado «ya no está en el club»</Badge>}
          {j.apoderados.length === 0 && <Badge tone="neutral">Adulto sin apoderado</Badge>}
        </div>
        <Dato etiqueta="RUT">{j.rut}</Dato>
        <Dato etiqueta="Nacimiento">
          {textoFecha(j.fecha_nacimiento)}
          {j.edad !== null && ` (${j.edad} años)`}
        </Dato>
        <Dato etiqueta="Disciplina">{TEXTO_DISCIPLINA[j.disciplina]}</Dato>
        {j.telefono && <Dato etiqueta="Teléfono">{j.telefono}</Dato>}

        {form ? (
          <>
            <div>
              <label
                className="text-[11px] uppercase tracking-wide text-muted-foreground"
                htmlFor={`cat-${j.id}`}
              >
                Categoría
              </label>
              <select
                id={`cat-${j.id}`}
                value={form.categoria_id}
                onChange={(e) => onChange({ categoria_id: e.target.value })}
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <CampoNumero
              id={`num-${j.id}`}
              etiqueta={`Número (${NUMERO_SIN_ASIGNAR} = sin número)`}
              valor={form.numero_camiseta}
              onChange={(v) => onChange({ numero_camiseta: v })}
            />
            <CampoNumero
              id={`bm-${j.id}`}
              etiqueta="Beca mensualidad"
              valor={form.beca_mensualidad_pct}
              onChange={(v) => onChange({ beca_mensualidad_pct: v })}
              sufijo="%"
            />
            <CampoNumero
              id={`bt-${j.id}`}
              etiqueta="Beca torneos"
              valor={form.beca_torneos_pct}
              onChange={(v) => onChange({ beca_torneos_pct: v })}
              sufijo="%"
            />
            <CampoNumero
              id={`bc-${j.id}`}
              etiqueta="Beca campus y clínicas"
              valor={form.beca_campus_pct}
              onChange={(v) => onChange({ beca_campus_pct: v })}
              sufijo="%"
            />
            {j.apoderados.length === 0 && (
              <div>
                <label
                  className="text-[11px] uppercase tracking-wide text-muted-foreground"
                  htmlFor={`mpj-${j.id}`}
                >
                  Método de pago
                </label>
                <SelectMetodoPago
                  id={`mpj-${j.id}`}
                  valor={form.metodo_pago}
                  onChange={(v) => onChange({ metodo_pago: v })}
                />
              </div>
            )}
            <div className="col-span-2 sm:col-span-4">
              <Marcar
                marcado={form.marcado}
                onChange={(v) => onChange({ marcado: v })}
                etiqueta="Marcar para aprobar o rechazar"
              />
            </div>
          </>
        ) : (
          <>
            <Dato etiqueta="Categoría">{nombreCategoria ?? "—"}</Dato>
            <Dato etiqueta="Número">{j.numero_camiseta ?? "—"}</Dato>
          </>
        )}
      </div>
    </div>
  );
}

/** Link privado de la familia: se genera uno nuevo y el anterior deja de funcionar. */
function LinkPrivado({ solicitudId }: { solicitudId: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const generar = useMutation({ mutationFn: () => api.panel.nuevoLinkSolicitud(solicitudId) });

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="card-surface mt-6 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="size-4" /> Link privado de la familia
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Si la familia perdió su link, genera uno nuevo y cópialo. El anterior deja de funcionar.
      </p>
      {generar.data ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={generar.data.url}
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs"
            aria-label="Link nuevo"
          />
          <Button variant="outline" size="sm" onClick={() => void copiar(generar.data.url)}>
            <Copy className="size-4" /> {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={generar.isPending}
            onClick={() => (confirmar ? generar.mutate() : setConfirmar(true))}
          >
            {confirmar ? "Sí, generar y anular el anterior" : "Generar link nuevo"}
          </Button>
          {confirmar && !generar.isPending && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
          )}
        </div>
      )}
      {generar.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {mensajeDeError(generar.error)}
        </p>
      )}
    </div>
  );
}
