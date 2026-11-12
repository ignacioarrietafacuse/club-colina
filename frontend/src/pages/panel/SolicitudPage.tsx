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
import { useState, type ReactNode } from "react";
import { EstadoBadge, FotoPersona } from "@/components/panel/persona";
import {
  nombreCompleto,
  TEXTO_AVISO,
  textoFaltantes,
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
  armarRechazoVinculo,
  contactoPosible,
  contarMarcadas,
  firmaSolicitud,
  formInicial,
  RECHAZO_TOTAL,
  seDecideAca,
  alcanceRechazoTotal,
  fotoPorLinkReenviado,
  vinculoAprobable,
  vinculoConocido,
  vinculoVa,
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
  // El formulario se rehace solo después de aprobar o rechazar, no cada vez que la consulta
  // vuelve a cargar sola: así no se pierde lo que Mony está escribiendo.
  const [generacion, setGeneracion] = useState(0);
  // Jugadores a los que se les quitó la marca «ya no está» en esta pantalla: parten sin marcar
  // cada vez que el formulario se rehace.
  const [desmarcados, setDesmarcados] = useState<ReadonlySet<string>>(() => new Set());

  return (
    <div>
      <Link
        to="/jugadores/solicitudes"
        className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Solicitudes
      </Link>
      {consulta.data === undefined ? (
        consulta.isError ? (
          <p role="alert" className="card-surface p-5 text-sm text-destructive">
            {mensajeDeError(consulta.error)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        )
      ) : (
        <>
          {/* Una recarga que falla con datos ya cargados no desmonta lo que se está editando. */}
          {consulta.isError && (
            <p role="alert" className="mb-4 rounded-lg bg-warning/15 px-4 py-3 text-sm">
              No se pudo actualizar la solicitud: {mensajeDeError(consulta.error)}
            </p>
          )}
          {categorias.data === undefined && categorias.isError && (
            <p role="alert" className="mb-4 rounded-lg bg-warning/15 px-4 py-3 text-sm">
              No se pudieron cargar las categorías: se mantiene la que ya tiene cada jugador.
            </p>
          )}
          <DetalleSolicitud
            key={generacion}
            s={consulta.data}
            categorias={categorias.data}
            desmarcados={desmarcados}
            alCambiar={(desmarcar = []) => {
              if (desmarcar.length > 0) setDesmarcados((d) => new Set([...d, ...desmarcar]));
              setGeneracion((g) => g + 1);
            }}
          />
          {/* Fuera del formulario que se rehace: el link se entrega una sola vez. */}
          <LinkPrivado
            solicitudId={consulta.data.id}
            segundoApoderado={consulta.data.tipo === "segundo_apoderado"}
          />
        </>
      )}
    </div>
  );
}

function DetalleSolicitud({
  s,
  categorias,
  desmarcados,
  alCambiar,
}: {
  s: SolicitudDetalle;
  /** `undefined` mientras no carguen (o si fallaron): el selector queda deshabilitado. */
  categorias: CategoriaPanel[] | undefined;
  desmarcados: ReadonlySet<string>;
  /** Rehace el formulario; `desmarcar` = jugadores que deben partir sin marcar. */
  alCambiar: (desmarcar?: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormAprobacion>(() => formInicial(s, desmarcados));
  const [errores, setErrores] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState<null | "marcadas" | "todo">(null);
  /** Llave del vínculo cuyo rechazo está a medio confirmar. */
  const [confirmarVinculo, setConfirmarVinculo] = useState<string | null>(null);

  // Cambiar las marcas anula una confirmación de rechazo a medio dar.
  function cambiarForm(cambio: (f: FormAprobacion) => FormAprobacion) {
    setConfirmar(null);
    setConfirmarVinculo(null);
    setForm(cambio);
  }

  const nombres: Record<string, string> = Object.fromEntries(
    [...s.jugadores, ...s.apoderados].map((p) => [p.id, nombreCompleto(p)]),
  );

  // invalidateQueries espera a que la solicitud (activa) se vuelva a pedir; recién ahí se
  // rehace el formulario con el detalle nuevo.
  const refrescar = async () => {
    await queryClient.invalidateQueries({ queryKey: ["panel"] });
    alCambiar();
  };
  // Si la solicitud cambió por otro lado (otra pestaña, otro usuario), el formulario ya no
  // calza con lo que hay: no se envía hasta rehacerlo.
  const [firmaInicial] = useState(() => firmaSolicitud(s));
  const desfasado = firmaSolicitud(s) !== firmaInicial;

  const aprobar = useMutation({
    mutationFn: (datos: Parameters<typeof api.panel.aprobarSolicitud>[1]) =>
      api.panel.aprobarSolicitud(s.id, datos),
    onSuccess: refrescar,
  });
  const rechazar = useMutation({
    mutationFn: (datos: Parameters<typeof api.panel.rechazarSolicitud>[1]) =>
      api.panel.rechazarSolicitud(s.id, datos),
    onSuccess: refrescar,
  });

  const quitarMarca = useMutation({
    mutationFn: (jugadorId: string) => api.panel.quitarMarcaRetiro(jugadorId),
    // Como después de aprobar o rechazar: el formulario se rehace con el detalle nuevo (y una
    // firma nueva), y ese jugador parte sin marcar (decir que sigue en el club no es aprobarlo).
    onSuccess: async (_ficha, jugadorId) => {
      await queryClient.invalidateQueries({ queryKey: ["panel"] });
      alCambiar([jugadorId]);
    },
  });

  const personasPendientes =
    Object.keys(form.jugadores).length + Object.keys(form.apoderados).length;
  const hayPendientes = personasPendientes + Object.keys(form.vinculos).length > 0;
  const marcadas = contarMarcadas(form);
  const ocupado = aprobar.isPending || rechazar.isPending || quitarMarca.isPending || desfasado;
  const rechazaTodo = alcanceRechazoTotal(s).map((id) => nombres[id] ?? "");
  const conPosterior = s.avisos.includes("hay_solicitud_posterior");
  const huboRechazo = [...s.jugadores, ...s.apoderados].some((p) => p.estado === "rechazado");

  function enviarAprobacion() {
    if (desfasado) return;
    setConfirmar(null);
    setConfirmarVinculo(null);
    rechazar.reset();
    quitarMarca.reset();
    const r = armarAprobacion(form, nombres);
    if (!r.ok) return setErrores(r.errores);
    setErrores([]);
    aprobar.mutate(r.datos);
  }
  function enviarRechazoVinculo(llave: string) {
    if (desfasado) return;
    aprobar.reset();
    quitarMarca.reset();
    setConfirmar(null);
    const r = armarRechazoVinculo(llave);
    if (!r.ok) return setErrores(r.errores);
    setErrores([]);
    if (confirmarVinculo !== llave) return setConfirmarVinculo(llave);
    setConfirmarVinculo(null);
    rechazar.mutate(r.datos);
  }
  function enviarRechazo(cual: "marcadas" | "todo") {
    setConfirmarVinculo(null);
    if (desfasado) return;
    aprobar.reset();
    quitarMarca.reset();
    const r = cual === "todo" ? { ok: true as const, datos: RECHAZO_TOTAL } : armarRechazo(form);
    if (!r.ok) return setErrores(r.errores);
    setErrores([]);
    if (confirmar !== cual) return setConfirmar(cual);
    setConfirmar(null);
    rechazar.mutate(r.datos);
  }

  // Solo el error de la última acción.
  const errorServidor = aprobar.error ?? rechazar.error ?? quitarMarca.error;

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
            fotoReenviada={fotoPorLinkReenviado(a, s)}
            soloSeMuestra={a.estado === "pendiente" && !seDecideAca(a)}
            form={form.apoderados[a.id]}
            onChange={(cambio) =>
              cambiarForm((f) => {
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
            soloSeMuestra={j.estado === "pendiente" && !seDecideAca(j)}
            sinContactoPosible={!contactoPosible(j.id, s)}
            quitarMarca={{
              enviar: () => {
                aprobar.reset();
                rechazar.reset();
                setConfirmar(null);
                setConfirmarVinculo(null);
                quitarMarca.mutate(j.id);
              },
              ocupado,
            }}
            categorias={categorias?.filter((c) => c.disciplina === j.disciplina)}
            form={form.jugadores[j.id]}
            onChange={(cambio) =>
              cambiarForm((f) => {
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
              const aprobable = vinculoAprobable(v, s);
              const conocido = vinculoConocido(v, s);
              return (
                <div key={llave} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <label className="flex min-w-0 flex-1 items-center gap-3">
                    {pendiente ? (
                      <input
                        type="checkbox"
                        disabled={!aprobable || (form.vinculos[llave] && !vinculoVa(form, llave))}
                        checked={vinculoVa(form, llave)}
                        onChange={(e) =>
                          cambiarForm((f) => ({
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
                      {pendiente && !conocido && (
                        <span className="block text-xs text-destructive">
                          Una de las personas no viene en esta solicitud: no se puede aprobar desde
                          acá.
                        </span>
                      )}
                      {pendiente && conocido && !aprobable && (
                        <span className="block text-xs text-destructive">
                          Una de las dos personas está rechazada, inactiva o precargada: no se puede
                          aprobar desde acá. Si está precargada, complétala y actívala en su ficha.
                        </span>
                      )}
                      {pendiente &&
                        aprobable &&
                        form.vinculos[llave] &&
                        !vinculoVa(form, llave) && (
                          <span className="block text-xs text-muted-foreground">
                            Se aprueba junto con la persona desmarcada, no antes.
                          </span>
                        )}
                      {confirmarVinculo === llave && (
                        <span role="alert" className="block text-xs text-destructive">
                          Se borra este vínculo y sus personas siguen pendientes (un precargado que
                          era de esta solicitud solo por este vínculo vuelve a como estaba). No se
                          deshace desde el panel.
                        </span>
                      )}
                    </span>
                  </label>
                  {pendiente && confirmarVinculo === llave && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmarVinculo(null)}
                      disabled={ocupado}
                    >
                      Cancelar
                    </Button>
                  )}
                  {pendiente && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => enviarRechazoVinculo(llave)}
                      disabled={ocupado}
                    >
                      <X className="size-4" />
                      {confirmarVinculo === llave
                        ? "Confirmar rechazo del vínculo"
                        : "Rechazar vínculo"}
                    </Button>
                  )}
                  <Badge tone={v.estado === "activo" ? "success" : "warning"}>
                    {v.estado === "activo" ? "Activo" : "Pendiente"}
                  </Badge>
                </div>
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

      {desfasado && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-warning/15 px-4 py-3 text-sm"
        >
          <span className="flex-1">
            La solicitud cambió desde que abriste esta pantalla. Recarga el formulario antes de
            aprobar o rechazar.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => alCambiar()}
            // Mientras corre una acción, su propio final rehace el formulario (y deja sin marcar a
            // quien se le quitó la marca): recargar antes lo dejaría marcado por un momento.
            disabled={aprobar.isPending || rechazar.isPending || quitarMarca.isPending}
          >
            Recargar formulario
          </Button>
        </div>
      )}

      {conPosterior && (confirmar !== null || confirmarVinculo !== null || huboRechazo) && (
        <div role="status" className="mb-4 rounded-lg bg-warning/15 px-4 py-3 text-sm">
          Llegó después otra solicitud con las mismas personas.{" "}
          {huboRechazo ? "Como rechazaste" : "Si rechazas"} a alguien de esta, pide a la familia de
          la solicitud posterior que vuelva a enviar el formulario.
        </div>
      )}

      {confirmar === "todo" && (
        <div role="alert" className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm">
          {rechazaTodo.length > 0
            ? `«Rechazar todo lo pendiente» rechaza, estén marcadas o no, a ${rechazaTodo.join(", ")}, y los vínculos pendientes de la solicitud.`
            : "«Rechazar todo lo pendiente» rechaza los vínculos pendientes de la solicitud (no queda ninguna persona por decidir desde acá)."}{" "}
          No se deshace desde el panel.
        </div>
      )}

      {hayPendientes ? (
        <div className="card-surface flex flex-wrap items-center gap-3 p-4">
          <p className="flex-1 text-sm text-muted-foreground">
            Se aprueba lo marcado; lo que quede sin marcar sigue pendiente. Un vínculo se rechaza
            con su propio botón.
          </p>
          {confirmar && (
            <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={ocupado}>
              Cancelar
            </Button>
          )}
          <Button variant="outline" onClick={() => enviarRechazo("todo")} disabled={ocupado}>
            <X className="size-4" />
            {confirmar === "todo"
              ? "Confirmar: rechazar personas y vínculos pendientes"
              : "Rechazar todo lo pendiente"}
          </Button>
          {personasPendientes > 0 && (
            <Button
              variant="outline"
              onClick={() => enviarRechazo("marcadas")}
              disabled={ocupado || marcadas === 0}
            >
              <X className="size-4" />
              {confirmar === "marcadas"
                ? `Confirmar rechazo de ${marcadas} ${marcadas === 1 ? "persona" : "personas"}`
                : "Rechazar personas marcadas"}
            </Button>
          )}
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
    </div>
  );
}

function NotaSoloSeMuestra() {
  return (
    <span className="w-full text-xs text-muted-foreground">
      Se decide desde su propia solicitud o su ficha; desde acá, a lo más, su vínculo.
    </span>
  );
}

/** «Sigue en el club»: quita la marca de retiro, con confirmación. */
function QuitarMarcaRetiro({ enviar, ocupado }: { enviar: () => void; ocupado: boolean }) {
  const [confirmar, setConfirmar] = useState(false);
  return (
    <span className="flex w-full flex-wrap items-center gap-2 text-xs text-muted-foreground">
      Para confirmar el retiro, abre su ficha y déjalo inactivo. Si sigue en el club:
      {confirmar ? (
        <>
          <Button size="sm" variant="outline" disabled={ocupado} onClick={enviar}>
            Confirmar: sigue en el club
          </Button>
          <Button size="sm" variant="ghost" disabled={ocupado} onClick={() => setConfirmar(false)}>
            Cancelar
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setConfirmar(true)}>
          Quitar la marca
        </Button>
      )}
    </span>
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
  fotoReenviada,
  soloSeMuestra,
  form,
  onChange,
}: {
  a: ApoderadoDetalle;
  fotoReenviada: boolean;
  soloSeMuestra: boolean;
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
          {a.faltantes.length > 0 && (
            <Badge tone="danger">Falta: {textoFaltantes(a.faltantes)}</Badge>
          )}
          {fotoReenviada && (
            <span className="w-full text-xs text-warning-foreground">
              Foto subida con un link reenviado por quien llenó la solicitud; confírmala antes de
              aprobar.
            </span>
          )}
          {soloSeMuestra && <NotaSoloSeMuestra />}
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
  soloSeMuestra,
  sinContactoPosible,
  quitarMarca,
  categorias,
  form,
  onChange,
}: {
  j: JugadorDetalle;
  soloSeMuestra: boolean;
  /** Adulto sin teléfono sin un vínculo aprobable desde acá (ver `contactoPosible`). */
  sinContactoPosible: boolean;
  quitarMarca: { enviar: () => void; ocupado: boolean };
  categorias: CategoriaPanel[] | undefined;
  form: FormJugador | undefined;
  onChange: (c: Partial<FormJugador>) => void;
}) {
  const nombreCategoria = categorias?.find((c) => c.id === j.categoria_id)?.nombre;
  return (
    <div className="card-surface flex flex-wrap gap-4 p-4">
      <FotoPersona tipo="jugadores" id={j.id} tieneFoto={j.tiene_foto} tamano={96} />
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-2">
          <Link to="/jugadores/$id" params={{ id: j.id }} className="font-semibold hover:underline">
            {nombreCompleto(j)}
          </Link>
          <EstadoBadge estado={j.estado} />
          {j.faltantes.length > 0 && (
            <Badge tone="danger">Falta: {textoFaltantes(j.faltantes)}</Badge>
          )}
          {j.postula_beca && <Badge tone="accent">Postula a beca</Badge>}
          {j.marcado_retiro_en && <Badge tone="danger">Marcado «ya no está en el club»</Badge>}
          {j.marcado_retiro_en && (
            <QuitarMarcaRetiro enviar={quitarMarca.enviar} ocupado={quitarMarca.ocupado} />
          )}
          {soloSeMuestra && <NotaSoloSeMuestra />}
          {j.apoderados.length === 0 && <Badge tone="neutral">Adulto sin apoderado</Badge>}
          {j.estado === "pendiente" &&
            j.faltantes.includes("telefono") &&
            (sinContactoPosible ? (
              <span className="w-full text-xs text-destructive">
                No tiene teléfono ni un apoderado que se pueda aprobar desde acá: agrégale teléfono
                en su ficha antes de aprobarlo.
              </span>
            ) : (
              <span className="w-full text-xs text-muted-foreground">
                No tiene teléfono: se aprueba en el mismo envío que su apoderado y el vínculo entre
                ellos.
              </span>
            ))}
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
                disabled={!categorias}
                onChange={(e) => onChange({ categoria_id: e.target.value })}
                className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
              >
                {/* Sin la lista, se muestra la que tiene (no "Sin categoría") y no se cambia. */}
                {!categorias && form.categoria_id !== "" && (
                  <option value={form.categoria_id}>Categoría actual</option>
                )}
                <option value="">Sin categoría</option>
                {(categorias ?? []).map((c) => (
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
function LinkPrivado({
  solicitudId,
  segundoApoderado,
}: {
  solicitudId: string;
  /** En una solicitud de segundo apoderado el link es el de `/completar` (subir su foto). */
  segundoApoderado: boolean;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const [copiado, setCopiado] = useState<null | boolean>(null);
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
        <Link2 className="size-4" />{" "}
        {segundoApoderado ? "Link personal del segundo apoderado" : "Link privado de la familia"}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {segundoApoderado
          ? "Es el link para que suba su foto. Si lo perdió, genera uno nuevo y cópialo."
          : "Si la familia perdió su link, genera uno nuevo y cópialo."}{" "}
        El anterior deja de funcionar.
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
          {copiado === false && (
            <p role="alert" className="w-full text-xs text-destructive">
              No se pudo copiar: selecciona el link y cópialo a mano.
            </p>
          )}
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
