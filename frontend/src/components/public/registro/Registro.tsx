import {
  normalizarRut,
  type CategoriaPublica,
  type RutLookupResponse,
  type SolicitudCreadaResponse,
} from "@club-colina/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { mensajeError, statusDe } from "../api";
import { Aviso } from "../Marco";
import { Campo, CamposPersona, Casilla } from "./campos";
import {
  armarSolicitud,
  busquedaDesdeLookup,
  camposHijo,
  camposTitular,
  conHijo,
  esApoderado,
  hijosParaOtro,
  iniciarFormulario,
  nombreHijo,
  nuevoFormulario,
  nuevoHijoPorRut,
  pasosDe,
  puedeAgregarHijo,
  puedeMarcarYaNoEsta,
  sinHijo,
  titularYaRegistrado,
  validarPaso,
  type Errores,
  type Formulario,
  type OtroApoderado,
  type Hijo,
  type Paso,
} from "./modelo";

type Pantalla =
  | { tipo: "rut" }
  | { tipo: "elegir_rol"; rut: string }
  | { tipo: "menor_de_edad" }
  | { tipo: "adulto_ya_registrado" }
  | { tipo: "formulario"; formulario: Formulario; paso: number }
  | { tipo: "listo"; resultado: SolicitudCreadaResponse };

/** Formulario de registro por pasos, según el diseño (`docs/diseno-credenciales-qr.md`). */
export function Registro({ baseUrl }: { baseUrl: string }) {
  const [pantalla, setPantalla] = useState<Pantalla>({ tipo: "rut" });
  const reiniciar = () => setPantalla({ tipo: "rut" });

  // Cada pantalla o paso nuevo parte arriba: en el celular el botón queda al final.
  const lugar = pantalla.tipo === "formulario" ? `paso-${pantalla.paso}` : pantalla.tipo;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [lugar]);

  switch (pantalla.tipo) {
    case "rut":
      return (
        <PasoRut
          onListo={(rut, lookup) => {
            const inicio = iniciarFormulario(rut, lookup);
            setPantalla(inicio.tipo === "formulario" ? { ...inicio, paso: 0 } : inicio);
          }}
        />
      );
    case "elegir_rol":
      return (
        <PasoRol
          onElegir={(tipo) =>
            setPantalla({
              tipo: "formulario",
              paso: 0,
              formulario: nuevoFormulario(pantalla.rut, { tipo, lookup: null }),
            })
          }
          onVolver={reiniciar}
        />
      );
    case "menor_de_edad":
      return (
        <Final onVolver={reiniciar}>
          Ese RUT es de un jugador menor de edad. El registro lo hace su apoderado, escribiendo su
          propio RUT.
        </Final>
      );
    case "adulto_ya_registrado":
      return (
        <Final onVolver={reiniciar}>
          Ya enviaste tu registro. Revisa el estado en el link privado que recibiste; si lo
          perdiste, pídele uno nuevo al club.
        </Final>
      );
    case "formulario":
      return (
        <Pasos
          formulario={pantalla.formulario}
          paso={pantalla.paso}
          onCambio={(cambio) =>
            setPantalla((p) =>
              p.tipo === "formulario" ? { ...p, formulario: cambio(p.formulario) } : p,
            )
          }
          onPaso={(paso) => setPantalla((p) => (p.tipo === "formulario" ? { ...p, paso } : p))}
          onEnviado={(resultado) => setPantalla({ tipo: "listo", resultado })}
          onReiniciar={reiniciar}
          onAtrasInicio={() =>
            // Quien eligió su rol vuelve a esa pregunta, con el mismo RUT.
            setPantalla(
              pantalla.formulario.titular.lookup === null
                ? { tipo: "elegir_rol", rut: pantalla.formulario.rut }
                : { tipo: "rut" },
            )
          }
        />
      );
    case "listo":
      return <Listo resultado={pantalla.resultado} baseUrl={baseUrl} />;
  }
}

function Final({ children, onVolver }: { children: ReactNode; onVolver: () => void }) {
  return (
    <div className="space-y-4">
      <Aviso>{children}</Aviso>
      <Button variant="outline" onClick={onVolver}>
        Usar otro RUT
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RUT
// ---------------------------------------------------------------------------

function PasoRut({ onListo }: { onListo: (rut: string, lookup: RutLookupResponse) => void }) {
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);

  async function continuar() {
    const rut = normalizarRut(valor);
    if (rut === null) {
      setError("El RUT no es válido. Revisa los números y el dígito verificador.");
      return;
    }
    setError(null);
    setBuscando(true);
    try {
      onListo(rut, await api.publico.consultarRut(rut));
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void continuar();
      }}
    >
      <p className="text-sm text-muted-foreground">
        Regístrate para obtener la credencial con código QR para entrar al Pucalán. Si eres
        apoderado, escribe tu RUT (no el de tu hijo).
      </p>
      <Campo etiqueta="Tu RUT" error={error ?? undefined} ayuda="Por ejemplo 12.345.678-5">
        {(id) => (
          <Input
            id={id}
            className="h-11 text-lg"
            autoComplete="off"
            inputMode="text"
            maxLength={14}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        )}
      </Campo>
      <Button type="submit" size="lg" className="w-full" disabled={buscando}>
        {buscando ? "Buscando…" : "Continuar"}
      </Button>
    </form>
  );
}

function PasoRol({
  onElegir,
  onVolver,
}: {
  onElegir: (tipo: "apoderado" | "jugador_adulto") => void;
  onVolver: () => void;
}) {
  const opcion = "w-full rounded-xl border bg-card p-4 text-left shadow-sm hover:border-secondary";
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        No encontramos tu RUT en la base del club. ¿Quién eres?
      </p>
      <button type="button" className={opcion} onClick={() => onElegir("apoderado")}>
        <span className="block font-semibold">Apoderado</span>
        <span className="text-sm text-muted-foreground">Inscribo a uno o más hijos.</span>
      </button>
      <button type="button" className={opcion} onClick={() => onElegir("jugador_adulto")}>
        <span className="block font-semibold">Jugador mayor de edad</span>
        <span className="text-sm text-muted-foreground">Me inscribo yo.</span>
      </button>
      <Button variant="ghost" onClick={onVolver}>
        Volver
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pasos del formulario
// ---------------------------------------------------------------------------

const TITULO_PASO: Record<Paso, string> = {
  titular: "Tus datos",
  hijos: "Tus hijos",
  otro: "Otro apoderado",
  confirmar: "Enviar",
};

function Pasos({
  formulario: f,
  paso,
  onCambio,
  onPaso,
  onEnviado,
  onReiniciar,
  onAtrasInicio,
}: {
  formulario: Formulario;
  paso: number;
  onCambio: (cambio: (f: Formulario) => Formulario) => void;
  onPaso: (paso: number) => void;
  onEnviado: (r: SolicitudCreadaResponse) => void;
  onReiniciar: () => void;
  onAtrasInicio: () => void;
}) {
  const pasos = pasosDe(f);
  const actual = pasos[Math.min(paso, pasos.length - 1)] ?? "confirmar";
  const [errores, setErrores] = useState<Errores>({});
  const [enviando, setEnviando] = useState(false);
  const [fallaEnvio, setFallaEnvio] = useState<{ mensaje: string; reiniciar: boolean } | null>(
    null,
  );

  const pideCategoria =
    camposTitular(f.titular).pedir.has("categoria") ||
    f.hijos.some((h) => camposHijo(h).pedir.has("categoria"));
  const categorias = useQuery({
    queryKey: ["public", "categorias"],
    queryFn: ({ signal }) => api.publico.categoriasPublicas(signal),
    enabled: pideCategoria,
    staleTime: Infinity,
  });

  async function avanzar() {
    const e = validarPaso(f, actual);
    setErrores(e);
    if (Object.keys(e).length > 0) return;
    if (actual !== "confirmar") {
      onPaso(paso + 1);
      return;
    }
    setFallaEnvio(null);
    setEnviando(true);
    try {
      const { datos, fotos } = armarSolicitud(f);
      onEnviado(await api.publico.crearSolicitud(datos, fotos));
    } catch (err) {
      setFallaEnvio({ mensaje: mensajeError(err), reiniciar: statusDe(err) === 409 });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      noValidate
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void avanzar();
      }}
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Paso {pasos.indexOf(actual) + 1} de {pasos.length}
        </p>
        <h2 className="text-xl font-semibold">{TITULO_PASO[actual]}</h2>
      </div>

      {actual === "titular" && (
        <PasoTitular f={f} onCambio={onCambio} errores={errores} categorias={categorias.data} />
      )}
      {actual === "hijos" && (
        <PasoHijos f={f} onCambio={onCambio} errores={errores} categorias={categorias.data} />
      )}
      {actual === "otro" && <PasoOtro f={f} onCambio={onCambio} errores={errores} />}
      {actual === "confirmar" && <PasoConfirmar f={f} onCambio={onCambio} errores={errores} />}

      {categorias.isError && pideCategoria && (
        <Aviso tono="error">
          No pudimos cargar las categorías. Revisa tu conexión.{" "}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => void categorias.refetch()}
          >
            Reintentar
          </button>
        </Aviso>
      )}
      {Object.keys(errores).length > 0 && (
        <Aviso tono="error">Revisa los campos marcados en rojo.</Aviso>
      )}
      {fallaEnvio && (
        <Aviso tono="error">
          {fallaEnvio.mensaje}
          {fallaEnvio.reiniciar && (
            <button type="button" className="ml-1 font-medium underline" onClick={onReiniciar}>
              Volver a empezar
            </button>
          )}
        </Aviso>
      )}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={enviando}
          onClick={() => {
            setErrores({});
            if (paso === 0) onAtrasInicio();
            else onPaso(paso - 1);
          }}
        >
          Atrás
        </Button>
        <Button type="submit" size="lg" className="flex-1" disabled={enviando}>
          {actual === "confirmar" ? (enviando ? "Enviando…" : "Enviar registro") : "Continuar"}
        </Button>
      </div>
    </form>
  );
}

/**
 * `onCambio` recibe una función del formulario más reciente al nuevo: una foto que se comprime
 * o una búsqueda que tarda no pisan lo que la persona escribió mientras tanto. Adentro de cada
 * `onCambio((f) => ...)`, `f` es el formulario del momento del cambio, no el del render.
 */
interface PropsPaso {
  f: Formulario;
  onCambio: (cambio: (f: Formulario) => Formulario) => void;
  errores: Errores;
}

function PasoTitular({
  f,
  onCambio,
  errores,
  categorias,
}: PropsPaso & { categorias: CategoriaPublica[] | undefined }) {
  const c = camposTitular(f.titular);
  return (
    <div className="space-y-5">
      {f.titular.lookup !== null && (
        <Aviso>Encontramos tu RUT en la base del club. Solo te preguntamos lo que falta.</Aviso>
      )}
      <CamposPersona
        c={c}
        datos={f.datos}
        foto={f.foto}
        onDatos={(cambio) => onCambio((f) => ({ ...f, datos: { ...f.datos, ...cambio } }))}
        onFoto={(foto) => onCambio((f) => ({ ...f, foto }))}
        errores={errores}
        categorias={categorias}
        etiquetaFoto="Tu foto"
      />
      {esApoderado(f) && !titularYaRegistrado(f) && (
        <Casilla
          marcada={f.paga_mensualidad}
          onCambio={(v) => onCambio((f) => ({ ...f, paga_mensualidad: v }))}
        >
          Soy quien paga la mensualidad.
        </Casilla>
      )}
    </div>
  );
}

function PasoHijos({
  f,
  onCambio,
  errores,
  categorias,
}: PropsPaso & { categorias: CategoriaPublica[] | undefined }) {
  const [buscando, setBuscando] = useState<string | null>(null);
  const [fallas, setFallas] = useState<Record<string, string>>({});

  // RUT que se está buscando por hijo. Si la persona lo corrige, la respuesta vieja se descarta.
  const enBusqueda = useRef<Record<string, string | undefined>>({});

  async function buscar(h: Hijo) {
    if (h.origen.tipo !== "rut" || buscando === h.clave) return;
    const rut = normalizarRut(h.origen.rut);
    if (rut === null) {
      setFallas((x) => ({ ...x, [h.clave]: "Escribe un RUT válido." }));
      return;
    }
    if (rut === f.rut) {
      setFallas((x) => ({ ...x, [h.clave]: "Es tu propio RUT. Escribe el de tu hijo." }));
      return;
    }
    setFallas((x) => ({ ...x, [h.clave]: "" }));
    setBuscando(h.clave);
    enBusqueda.current[h.clave] = rut;
    const sigueVigente = () => enBusqueda.current[h.clave] === rut;
    try {
      const r = busquedaDesdeLookup(await api.publico.consultarRut(rut));
      if ("error" in r) {
        if (sigueVigente()) setFallas((x) => ({ ...x, [h.clave]: r.error }));
      } else
        // Si mientras tanto corrigió el RUT, el resultado ya no es de ese RUT: se descarta.
        onCambio((f) =>
          conHijo(f, h.clave, (y) =>
            y.origen.tipo === "rut" && normalizarRut(y.origen.rut) === rut
              ? { ...y, origen: { tipo: "rut", rut, busqueda: r } }
              : y,
          ),
        );
    } catch (e) {
      if (sigueVigente()) setFallas((x) => ({ ...x, [h.clave]: mensajeError(e) }));
    } finally {
      setBuscando((b) => (b === h.clave ? null : b));
    }
  }

  return (
    <div className="space-y-4">
      {f.hijos.map((h, i) => {
        const p = `hijo.${h.clave}.`;
        const c = camposHijo(h);
        return (
          <section key={h.clave} className="space-y-4 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{nombreHijo(h, i)}</h3>
              {h.origen.tipo === "rut" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onCambio((f) => sinHijo(f, h.clave))}
                >
                  Quitar
                </Button>
              )}
            </div>

            {h.origen.tipo === "precargado" && h.origen.hijo.ya_registrado && (
              <p className="text-sm text-muted-foreground">
                Ya está registrado. No tienes que hacer nada.
              </p>
            )}

            {h.origen.tipo === "rut" && (
              <div className="space-y-2">
                <Campo etiqueta="RUT del hijo" error={fallas[h.clave] || errores[`${p}rut`]}>
                  {(id) => (
                    <div className="flex gap-2">
                      <Input
                        id={id}
                        className="h-10"
                        autoComplete="off"
                        maxLength={14}
                        value={h.origen.tipo === "rut" ? h.origen.rut : ""}
                        enterKeyHint="search"
                        onKeyDown={(e) => {
                          // La tecla «Ir» del celular busca el RUT en vez de enviar el paso.
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void buscar(h);
                          }
                        }}
                        onChange={(e) => {
                          const valor = e.target.value;
                          enBusqueda.current[h.clave] = undefined;
                          setFallas((x) => ({ ...x, [h.clave]: "" }));
                          onCambio((f) =>
                            conHijo(f, h.clave, (y) => ({
                              ...y,
                              origen: {
                                tipo: "rut",
                                rut: valor,
                                busqueda: { estado: "sin_buscar" },
                              },
                            })),
                          );
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10"
                        disabled={buscando === h.clave}
                        onClick={() => void buscar(h)}
                      >
                        {buscando === h.clave ? "Buscando…" : "Buscar"}
                      </Button>
                    </div>
                  )}
                </Campo>
                {h.origen.busqueda.estado === "nuevo" && (
                  <p className="text-sm text-muted-foreground">
                    No está en la base del club: completa sus datos.
                  </p>
                )}
                {h.origen.busqueda.estado === "precargado" &&
                  (h.origen.busqueda.ya_registrado ? (
                    <Aviso>
                      {h.origen.busqueda.primer_nombre} ya está inscrito. Quedarás vinculado como su
                      apoderado cuando el club lo apruebe.
                    </Aviso>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Encontramos a {h.origen.busqueda.primer_nombre} en la base: solo completa lo
                      que falta.
                    </p>
                  ))}
              </div>
            )}

            <CamposPersona
              c={c}
              datos={h.datos}
              foto={h.foto}
              onDatos={(cambio) =>
                onCambio((f) =>
                  conHijo(f, h.clave, (y) => ({ ...y, datos: { ...y.datos, ...cambio } })),
                )
              }
              onFoto={(foto) => onCambio((f) => conHijo(f, h.clave, (y) => ({ ...y, foto })))}
              errores={errores}
              prefijo={p}
              categorias={categorias}
              etiquetaFoto={`Foto de ${nombreHijo(h, i)}`}
            />

            {puedeMarcarYaNoEsta(h) && (
              <Casilla
                marcada={h.ya_no_esta}
                onCambio={(v) =>
                  onCambio((f) => ({
                    ...conHijo(f, h.clave, (y) => ({ ...y, ya_no_esta: v })),
                    otro: f.otro
                      ? { ...f.otro, hijos: f.otro.hijos.filter((x) => !v || x !== h.clave) }
                      : null,
                  }))
                }
              >
                Ya no está en el club
              </Casilla>
            )}
          </section>
        );
      })}

      {errores["hijos"] && <p className="text-sm text-destructive">{errores["hijos"]}</p>}

      {puedeAgregarHijo(f) && (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => onCambio((f) => ({ ...f, hijos: [...f.hijos, nuevoHijoPorRut()] }))}
        >
          {f.hijos.length === 0 ? "Agregar un hijo" : "Agregar otro hijo"}
        </Button>
      )}
    </div>
  );
}

function PasoOtro({ f, onCambio, errores }: PropsPaso) {
  const o = f.otro;
  const candidatos = hijosParaOtro(f);
  if (!o) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Si otra persona también es apoderado de tus hijos (por ejemplo, la mamá o el papá), puedes
          agregarla para que también tenga su credencial. Es opcional.
        </p>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={candidatos.length === 0}
          onClick={() =>
            onCambio((f) => ({
              ...f,
              otro: {
                nombre: "",
                apellido: "",
                rut: "",
                telefono: "",
                hijos: candidatos.map((h) => h.clave),
              },
            }))
          }
        >
          Agregar otro apoderado
        </Button>
        {candidatos.length === 0 && (
          <p className="text-xs text-muted-foreground">Primero agrega al menos un hijo.</p>
        )}
      </div>
    );
  }
  const set = (cambio: (actual: OtroApoderado) => Partial<OtroApoderado>) =>
    onCambio((f) => (f.otro ? { ...f, otro: { ...f.otro, ...cambio(f.otro) } } : f));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Quedará registrado sin foto. Al terminar te daremos un link para que se lo envíes y suba la
        suya.
      </p>
      <Campo etiqueta="Nombre" error={errores["otro.nombre"]}>
        {(id) => (
          <Input
            id={id}
            className="h-10"
            maxLength={80}
            value={o.nombre}
            onChange={(e) => {
              const valor = e.target.value;
              set(() => ({ nombre: valor }));
            }}
          />
        )}
      </Campo>
      <Campo etiqueta="Apellido" error={errores["otro.apellido"]}>
        {(id) => (
          <Input
            id={id}
            className="h-10"
            maxLength={80}
            value={o.apellido}
            onChange={(e) => {
              const valor = e.target.value;
              set(() => ({ apellido: valor }));
            }}
          />
        )}
      </Campo>
      <Campo etiqueta="RUT" error={errores["otro.rut"]}>
        {(id) => (
          <Input
            id={id}
            className="h-10"
            autoComplete="off"
            maxLength={14}
            value={o.rut}
            onChange={(e) => {
              const valor = e.target.value;
              set(() => ({ rut: valor }));
            }}
          />
        )}
      </Campo>
      <Campo
        etiqueta="Teléfono"
        error={errores["otro.telefono"]}
        ayuda="9 dígitos, por ejemplo 912345678."
      >
        {(id) => (
          <Input
            id={id}
            type="tel"
            inputMode="tel"
            className="h-10"
            maxLength={20}
            value={o.telefono}
            onChange={(e) => {
              const valor = e.target.value;
              set(() => ({ telefono: valor }));
            }}
          />
        )}
      </Campo>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">¿De cuáles hijos es apoderado?</legend>
        {candidatos.map((h) => (
          <Casilla
            key={h.clave}
            marcada={o.hijos.includes(h.clave)}
            onCambio={(v) =>
              set((actual) => ({
                hijos: v
                  ? [...actual.hijos.filter((x) => x !== h.clave), h.clave]
                  : actual.hijos.filter((x) => x !== h.clave),
              }))
            }
          >
            {nombreHijo(h, f.hijos.indexOf(h))}
          </Casilla>
        ))}
        {errores["otro.hijos"] && (
          <p className="text-sm text-destructive">{errores["otro.hijos"]}</p>
        )}
      </fieldset>
      <Button type="button" variant="ghost" onClick={() => onCambio((f) => ({ ...f, otro: null }))}>
        No agregar otro apoderado
      </Button>
    </div>
  );
}

function PasoConfirmar({ f, onCambio, errores }: PropsPaso) {
  return (
    <div className="space-y-4">
      {errores["envio"] && <Aviso tono="error">{errores["envio"]}</Aviso>}
      <p className="text-sm text-muted-foreground">
        El club revisará tu registro. Cuando lo apruebe, verás los códigos QR en el link privado que
        te daremos al enviar.
      </p>
      <Casilla
        marcada={f.consentimiento}
        onCambio={(v) => onCambio((f) => ({ ...f, consentimiento: v }))}
        error={errores["consentimiento"]}
      >
        Autorizo al Club Colina a usar estos datos y fotos para identificar a las personas
        registradas al entrar a sus actividades.
      </Casilla>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export function LinkParaGuardar({ url, etiqueta }: { url: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium">{etiqueta}</p>
      <p className="select-all break-all rounded-md bg-muted p-2 font-mono text-xs">{url}</p>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => void copiar()}>
          {copiado ? "Copiado" : "Copiar link"}
        </Button>
        {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void navigator.share({ url }).catch(() => undefined)}
          >
            Compartir
          </Button>
        )}
      </div>
    </div>
  );
}

export function Listo({
  resultado,
  baseUrl,
}: {
  resultado: SolicitudCreadaResponse;
  baseUrl: string;
}) {
  // El link es la única vez que se entrega: avisar antes de cerrar la pestaña.
  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome antiguo exige además returnValue.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, []);

  const base = baseUrl.replace(/\/+$/, "");
  return (
    <div className="space-y-5">
      <Aviso tono="ok">¡Listo! Recibimos tu registro. El club lo revisará pronto.</Aviso>
      <Aviso tono="atencion">
        <strong>Guarda este link ahora.</strong> Es la única vez que lo verás. Ahí vas a ver el
        estado del registro y, cuando el club lo apruebe, los códigos QR.
      </Aviso>
      <LinkParaGuardar
        etiqueta="Tu link privado"
        url={`${base}/familia/${encodeURIComponent(resultado.token_acceso)}`}
      />
      {resultado.otros_apoderados.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Para los otros apoderados</h2>
          <p className="text-sm text-muted-foreground">
            Envíale a cada uno su link para que suba su foto. Sin foto, su credencial no se activa.
          </p>
          {resultado.otros_apoderados.map((o) => (
            <LinkParaGuardar
              key={o.completar_token}
              etiqueta={o.nombre_completo}
              url={`${base}/completar/${encodeURIComponent(o.completar_token)}`}
            />
          ))}
        </section>
      )}
    </div>
  );
}
