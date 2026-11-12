# Club Colina — cómo trabajamos: ramas, cambios, CI y despliegues

**Fecha:** 2026-11-11 (v3: respaldos diario y semanal). Adaptado de las prácticas de otro proyecto de Ignacio, recortado para un solo desarrollador que trabaja con sesiones de Claude Code.
En el monorepo vive en `docs/flujo-de-trabajo.md`. Lo leen Ignacio y los agentes. Si algo de acá no calza con la práctica, se corrige el documento.

## La idea

Una sesión de Claude Code lleva un cambio de punta a punta: lo escribe, lo hace revisar por un subagente, lo fusiona, lo publica y lo verifica. Ignacio no abre otras sesiones ni aprieta botones. Tres cosas hacen que eso sea seguro:

1. **Nada llega a `main` sin PR, chequeo en verde y revisión** cuando el tamaño la pide. `main` es lo que está en producción.
2. **Todo se puede deshacer:** el código con un revert, la base de datos con un respaldo.
3. **Lo que no se puede deshacer sobre datos reales pide el OK de Ignacio,** en el mismo chat.

## Ramas

| Rama | Para qué | Reglas |
|---|---|---|
| `main` | La única de larga vida. Lo que está ahí está en producción | Solo por PR. Nunca empuje directo ni `--force` |
| `<tema>` | Un cambio con un propósito (`formulario-foto`, `panel-filtros`) | Nace de `main`, vuelve a `main` por PR, se borra al fusionar. Pocos días de vida |
| `exp/<tema>` | Probar ideas rápido | Sin PR ni chequeos. Nunca se fusiona: lo que sirva se rehace en una rama de trabajo |

No hay `develop` ni `staging`.

El nombre de la rama puede venir asignado por la herramienta (las sesiones en la nube usan nombres como `claude/…`); no importa. Lo que se exige es el título del PR.

## Tres tamaños de cambio

| Tamaño | Ejemplos | Camino |
|---|---|---|
| **Chico** | Textos, estilos, un ajuste de pantalla, documentación | Rama → PR → chequeo verde → el agente fusiona |
| **Normal** | Lógica, endpoints, pantallas nuevas, cambios al contrato de `shared/` | Lo anterior + **una revisión por subagente** antes de fusionar |
| **Delicado** | Ver tabla de abajo | Lo anterior + **un segundo subagente con mirada de seguridad** + el cuidado específico de la tabla |

### La revisión: un subagente con contexto limpio

- La misma sesión que escribió el cambio lanza un subagente. Ignacio no abre nada.
- El subagente recibe solo el diff del PR, `CLAUDE.md` y los documentos de `docs/`. **No recibe la conversación ni el razonamiento de quien escribió el cambio:** así lo mira como alguien de afuera.
- Devuelve hallazgos. La sesión los resuelve o los justifica, y deja escrito en el PR qué se revisó y qué quedó abierto.
- Si tras dos rondas siguen apareciendo hallazgos de fondo, la sesión para y le avisa a Ignacio en vez de encadenar una tercera.
- Una revisión hecha por la misma sesión, sin subagente, no cuenta.

### Qué es delicado y qué cuidado lleva

| Si el cambio toca | El cuidado |
|---|---|
| Una migración | Ver "Migraciones". Si borra, renombra o cambia el tipo de algo: respaldo antes y OK de Ignacio |
| Rutas públicas (`/api/public/*`, registro, `/c/:token`) | Confirmar que ninguna respuesta devuelve RUT, teléfono, correo, fechas ni datos de familiares. Hay tests que lo comprueban: no se debilitan |
| Login, sesiones, permisos | Probar el caso "sin sesión" y el caso "error": ambos deniegan |
| Fotos y archivos | Nunca una URL pública fija. Solo se sirven por el backend |
| Script de importación | Siempre `--dry-run` primero. Nunca con la planilla real en tests |
| `.github/workflows/`, hooks, `.claude/settings.json`, `vercel.json` | Es la reja misma. El agente lo dice explícitamente en su resumen a Ignacio |
| Variables de entorno | Decir en el PR qué variable es nueva y dónde se creó. Actualizar `.env.example` |

## El chequeo (CI)

Un solo trabajo en `.github/workflows/ci.yml` que corre `pnpm check` (lint, tipos, tests y build).

- Corre en cada PR hacia `main` y en cada commit de `main`.
- En un PR, un empuje nuevo cancela la corrida anterior. En `main` no se cancela nada.
- No corre en `exp/*` ni en ramas sin PR.
- **Un chequeo nunca se debilita para pasar.** No se borra ni se salta un test para ponerlo en verde: se arregla el código. Si dos intentos no lo logran, el agente para y pregunta.

Se eligió un solo nivel porque el proyecto es chico y el chequeo completo tarda poco. Si llega a tardar más de unos 5 minutos, se parte en liviano y completo.

**Antes de empujar:** `pnpm check` en local. Mientras se itera, solo los tests de lo que se tocó.

## Qué puede hacer un agente

**Solo, sin preguntar**
- Crear ramas, empujar y abrir PRs.
- Fusionar un PR a `main` cuando el chequeo está en verde y la revisión que corresponde a su tamaño está hecha y anotada.
- Publicar (ocurre solo al fusionar) y verificar el resultado.
- En producción: leer estado y logs, crear o cambiar variables de entorno, volver al despliegue anterior, correr migraciones que solo agregan, crear usuarios del panel, y crear respaldos manuales o borrar los que ya cumplieron su propósito.

**Con el OK de Ignacio en el chat** (el agente deja todo preparado, explica en dos líneas qué va a pasar y espera)
- Una migración que borra, renombra o cambia el tipo de una columna o tabla.
- La importación de la base 2026 y cualquier script que modifique o borre muchas filas reales.
- Restaurar un respaldo.
- Borrar o vaciar un servicio, un volumen o una base en Railway. Vaciar un volumen elimina también todos sus respaldos.
- Cambiar el dominio o los DNS.

**Nunca**
- Empujar directo a `main`, `--force` sobre `main` o `--no-verify`.
- Mostrar, imprimir o pegar el valor de una credencial. Las usa a través de las herramientas (`railway run`, variables del entorno), sin leerlas.
- Volcar datos personales reales en el chat, en un PR o en un log. Para diagnosticar se usan conteos e ids, no nombres ni RUT.
- Crear datos de prueba en producción una vez que haya datos reales.

## Las rejas

GitHub no ofrece protección de ramas en repos privados del plan Free, así que la reja va en el propio repo:

- **Hooks de git versionados** en `.githooks/`, activados con `git config core.hooksPath .githooks` (lo hace `pnpm install`):
  - `pre-push`: rechaza cualquier empuje directo a `main`. Fusionar un PR en GitHub no pasa por acá y sigue funcionando.
  - `pre-commit`: rechaza `.env*` (salvo `.env.example`), planillas (`*.xlsx`, `*.csv`) y archivos de imagen fuera de los recursos del frontend.
- **Permisos de Claude Code** en `.claude/settings.json` (versionado): se deniegan `git push` a `main`, `--force` y `--no-verify`.
- **`.gitignore`**: `.env*`, `datos/`, `uploads/`, `*.xlsx`.
- **Guarda en los scripts que escriben** (ver "Datos reales").

## Despliegues

| Ambiente | Qué corre | Cómo se llega |
|---|---|---|
| **Local** | Front y back en la máquina o en la sesión, Postgres en Docker, datos ficticios | Siempre. Es donde se prueba todo lo que escribe |
| **Vista previa** | El frontend de cada PR (Vercel la crea sola) | Automático. **Habla con el backend de producción:** se usa para mirar, no para crear ni editar datos. Sin login: el panel se prueba en local |
| **Producción** | `main` | Automático al fusionar: Vercel publica el frontend y Railway el backend |

Reglas:

1. **Fusionar de a un PR a la vez.** Fusiona, espera el verde del despliegue, y recién entonces el siguiente. Con varias sesiones en paralelo, cada una hace `git fetch` y revisa que no haya un despliegue en curso antes de fusionar.
2. **Railway espera al chequeo** (opción "Wait for CI"). **El backend aplica las migraciones pendientes al arrancar**, antes de escuchar el puerto (`backend/src/server.ts`), solo con `NODE_ENV=production` y `MIGRAR_AL_ARRANCAR=si` (puestas en el servicio de Railway). Si una falla, el proceso termina con error y no escucha el puerto. Que Railway mantenga la versión anterior depende del **healthcheck en `/api/health` configurado en el panel del servicio**: el repo ya no lo fija. Con una sola instancia es seguro, y un candado de Postgres evita que dos arranques superpuestos migren a la vez. Nunca levantar el servidor con las variables de producción fuera de Railway (`railway run` sobre el servidor): migraría producción con el código de una rama.
3. **Frontend y backend se publican por separado**, así que por unos minutos conviven versiones distintas. Los cambios a la API son compatibles hacia atrás: agregar antes que quitar.
4. **Mirar después de publicar.** Un despliegue en verde no prueba que funcione: el agente abre la pantalla real o llama al endpoint y dice qué comprobó.
5. **Lo que se cambia a mano en producción queda escrito.** El código se cambia siempre por el repo. Las variables de entorno se cambian en la plataforma, y por eso se anotan en `.env.example` y en el PR.

### Migraciones

- **No hay vuelta atrás de la base.** Revertir el código no devuelve los datos ni el esquema.
- Toda migración es compatible con el código que ya está corriendo. Quitar o renombrar se hace en dos pasos: primero un despliegue que deja de usar la columna, después otro que la borra.
- Las migraciones ya aplicadas no se editan: se agrega una nueva.
- Una migración que borra o transforma datos lleva respaldo manual antes y el OK de Ignacio.

### Respaldos

Un respaldo es una copia de la base de datos y de las fotos, guardada aparte. Es lo único que permite recuperar los datos si un script, una migración o un agente los daña: el código se recupera de git, los datos no.

Se usan los respaldos de volumen de Railway, en el volumen de Postgres, que guarda también las fotos (tabla `fotos`):

| Respaldo | Cuándo | Cuánto dura |
|---|---|---|
| Diario | Automático, cada 24 horas | 6 días; se borra solo |
| Semanal | Automático, cada 7 días | 1 mes; se borra solo |
| Manual | Antes de una migración destructiva, de la importación de la base 2026 y de cualquier script que modifique muchas filas. Lo crea el agente como primer paso | El agente lo borra cuando se verificó que todo salió bien |

- El mensual no se activa: no aporta para este proyecto.
- **Costo:** los respaldos son incrementales; solo se paga por los datos que cambiaron entre una copia y otra, a la misma tarifa por GB que el volumen. Con una base de unos 100 MB, casi todo fotos, es de centavos y entra en la cuota del plan Pro. No se acumulan copias: como máximo hay 6 diarias y unas 4 semanales.
- **Límite:** vaciar o borrar un volumen elimina todos sus respaldos. Por eso esa acción pide el OK de Ignacio.
- **Probar una restauración una vez** antes del lanzamiento. Un respaldo que nunca se restauró es una suposición.

### Cuando algo sale mal

1. **Volver atrás primero, investigar después.** El agente vuelve al despliegue anterior en Vercel o Railway y avisa.
2. Después, un PR de revert a `main`, para que `main` y producción vuelvan a coincidir.
3. Si se dañaron datos: se restaura el respaldo, con el OK de Ignacio.

## Datos reales

El sistema guarda fotos y datos de menores (Ley 21.719). Estas reglas no tienen versión rápida.

- **Los datos reales viven solo en producción.** No se copian a local, a tests, a capturas, a PRs ni al chat.
- **La planilla del club nunca entra al repo.**
- **Todo dato de prueba es ficticio:** nombres inventados y RUT generados con dígito verificador válido por una función del repo, nunca copiados.
- **Los logs no llevan RUT, teléfonos, tokens de credencial ni tokens de acceso.** Un token en un log es una credencial filtrada.
- **El `.env` local apunta siempre a `localhost`.** La URL de la base de producción no se guarda en ningún `.env`.
- **Los scripts que escriben** (importación, crear usuario, migraciones manuales) se niegan a correr contra un host que no sea `localhost`, salvo con la opción explícita `--produccion`, que muestra el host antes de ejecutar. Así un comando contra producción es siempre una decisión y nunca un descuido.
- **Secretos fuera del repo y fuera del chat.**

## Código

- **Leer antes de tocar** y reutilizar antes de crear.
- **Solo lo que se pidió.** Sin refactors ni mejoras de pasada; si algo conviene arreglarlo, se dice y va en otro PR.
- TypeScript estricto, sin `any`, sin `as` para callar al compilador.
- El frontend nunca habla con la base: todo pasa por la API y por el contrato de `shared/`.
- Denegar por defecto: un caso desconocido o un error terminan en "no", no en "sí".
- Sin `console.log`; logger del backend.
- Una dependencia nueva solo si lo que ya hay no lo resuelve.
- Comentarios para el porqué. Un comentario que quedó falso se arregla en el mismo PR.
- Textos en español de Chile. Sin datos mock: lo no construido dice "Pendiente".

## Git y PRs

- **Un PR, un propósito.** Si necesita un "y además", son dos.
- **Commits y títulos de PR en español, con verbo en infinitivo,** que se entiendan sin abrir el PR: "Permitir al apoderado agregar un segundo apoderado", no "fix form".
- **Toda rama de trabajo tiene su PR.** Una rama sin PR es invisible para las otras sesiones.
- La descripción sigue la plantilla (`.github/pull_request_template.md`):
  - Qué cambia y por qué.
  - Tamaño (chico, normal o delicado).
  - Qué toca de base, variables o despliegue.
  - Qué revisó el subagente y qué quedó abierto.
  - Qué se verificó en producción después de publicar.
- Nunca `--no-verify`. En una rama propia, solo `--force-with-lease`.

## Varias sesiones a la vez

- **`git fetch origin` antes de opinar** sobre el estado de una rama o PR, y antes de fusionar.
- **Cada sesión en su rama y sus carpetas.** Antes de empezar, mirar los PRs abiertos; si otro PR toca el mismo archivo, se dice en la descripción.
- **`shared/` y las migraciones tienen un solo dueño a la vez.** Una sesión que necesita cambiarlos se detiene y avisa.
- **Una sola implementación por cambio.** Si ya hay un PR sobre lo mismo, se trabaja ahí.
- **Cuatro estados distintos, nombrados como tales:** preparado en local, subido al PR, fusionado, publicado y verificado.
- **Medir, no inferir.** Antes de afirmar algo sobre producción, se comprueba y se dice qué se midió y qué se supuso.

### Resumen al terminar

Lo que la sesión le deja a Ignacio en el chat y en el PR:

- Qué hizo y qué quedó explícitamente fuera.
- En qué estado quedó (subido, fusionado o publicado y verificado).
- Qué comprobó de verdad (comando y resultado) y qué solo supone.
- Qué tocó en producción.
- Siguiente paso e impedimentos.

## Las reglas que no se rompen

1. Nunca empujar directo a `main`: siempre por PR.
2. Nunca fusionar sin chequeo en verde ni sin la revisión que pide el tamaño.
3. Nunca fusionar `exp/*`.
4. Fusionar de a un PR a la vez, con su despliegue verde antes del siguiente.
5. Un test nunca es el arreglo.
6. Nunca `--no-verify` ni `--force` sobre `main`.
7. Nunca subir secretos, la planilla del club ni datos reales; nunca mostrar una credencial.
8. Lo irreversible sobre datos reales lleva respaldo antes y el OK de Ignacio.
9. Nunca datos de prueba en producción: se verifica mirando.
10. Ante la duda, parar y preguntar.

## Qué instala la Ola 0

Además de lo que dice `roadmap-etapa1.md`:

- `.githooks/pre-push` y `.githooks/pre-commit`, con su activación en `pnpm install`.
- `.claude/settings.json` con los permisos denegados.
- Un agente de revisión en `.claude/agents/revisor.md`, con la instrucción de revisar solo el diff y los documentos, y una variante de seguridad.
- `.github/workflows/ci.yml` y `.github/pull_request_template.md`.
- `.gitignore` y `.env.example`.
- `docker-compose.yml` con Postgres para local.
- La guarda de host en los scripts que escriben, y el generador de RUT ficticios para tests.
- `CLAUDE.md` con las reglas que no se rompen, la lista de "Qué puede hacer un agente" y un enlace a este documento.

**Configuración en las plataformas.** La hace la sesión de la Ola 0 con las herramientas que tenga; lo que no pueda hacer desde la sesión se lo deja a Ignacio como lista, con el paso exacto:
- GitHub: borrar ramas automáticamente al fusionar; permitir solo acciones de GitHub y verificadas.
- Railway: despliegue automático desde `main`, "Wait for CI", healthcheck en `/api/health`, variables `NODE_ENV=production` y `MIGRAR_AL_ARRANCAR=si`, y respaldos diario y semanal en el volumen de Postgres. Build y arranque los detecta Railpack desde los scripts `build` y `start` de la raíz. Las migraciones no se configuran en Railway: las corre el backend al arrancar.
- Vercel: confirmar que solo `main` publica a producción.

## Bitácora de decisiones

Cada decisión sobre cómo se trabaja se anota acá, con fecha y razón, en el mismo PR que la cambia.

| Fecha | Decisión | Por qué |
|---|---|---|
| 2026-11-11 | `main` es la única rama de larga vida y equivale a producción | Un solo desarrollador y un solo cliente: una rama por ambiente solo agrega merges |
| 2026-11-11 | Tres tamaños de cambio, con revisión solo desde "normal" | Que lo chico salga rápido y lo delicado salga revisado |
| 2026-11-11 | Un solo nivel de CI | El chequeo completo es corto; dos niveles no ahorran nada todavía |
| 2026-11-11 | La reja va en hooks y permisos del repo | GitHub Free no protege ramas en repos privados |
| 2026-11-11 | Los agentes empujan, fusionan y operan producción | Ignacio trabaja solo y no quiere ser el cuello de botella de cada cambio |
| 2026-11-11 | La revisión la hace un subagente con contexto limpio, lanzado por la misma sesión | Da una mirada externa sin que Ignacio abra otra sesión |
| 2026-11-11 | Lo irreversible sobre datos reales pide el OK de Ignacio en el chat | Es lo único que ni git ni un revert recuperan; el respaldo es la red y el OK, la decisión |
| 2026-11-11 | Los agentes usan credenciales sin verlas | Operan producción a través de las herramientas; el valor nunca llega al chat ni al repo |
| 2026-11-11 | Las vistas previas de Vercel hablan con el backend de producción | Evita un segundo backend. A cambio, en la vista previa solo se mira |
| 2026-11-11 | Los scripts que escriben exigen `--produccion` fuera de `localhost` | Un comando contra producción es una decisión, nunca un descuido |
| 2026-11-11 | Respaldos diario (6 días) y semanal (1 mes) en Railway, más uno manual antes de lo riesgoso; sin mensual | Cubre los accidentes no planificados; al ser incrementales y borrarse solos, el costo es de centavos |
| 2026-11-11 | Las fotos van en Postgres (tabla `fotos`), sin volumen aparte | Un solo volumen que respaldar y restaurar; la foto y su ficha se guardan en la misma transacción |
| 2026-11-12 | La lista de denegaciones de `.claude/settings.json` es un freno contra descuidos, no una barrera | Se salta con variantes de comando. Lo que de verdad frena es el hook `pre-push`, el CI y la revisión; no se confía en la lista para proteger secretos |
| 2026-11-12 | Sin login ni escrituras desde las vistas previas de Vercel; el panel se prueba en local | Las vistas previas corren código no fusionado contra producción. El backend rechaza toda escritura cuyo `Origin` no sea la URL de producción |
| 2026-11-12 | Los links privados (`token_acceso` y `/completar`) se guardan como hash; reenviar genera uno nuevo y anula el anterior | Una copia de la base no abre ningún link. `credencial_token` queda en claro porque hay que dibujar el QR |
| 2026-11-12 | `rut-lookup` no devuelve ids, `/familia` muestra solo a las personas de esa solicitud y el panel marca los casos sospechosos | Quien conoce un RUT ajeno no puede llegar a datos ni personas que no envió |
| 2026-11-12 | Las migraciones las corre el backend al arrancar, no la configuración de Railway (`railway.json` se borró) | El servicio no leía `railway.json`: el despliegue de `99e9be1` salió sin comando previo ni healthcheck, y `railway config migrate status` decía que ningún servicio usa Config as Code (Railway lo da por obsoleto desde el 2026-12-01). Arrancar migrando no depende de la plataforma, y si falla la versión nueva no levanta |
| 2026-11-12 | Grafo de código con graphify (estándar `graphify-estandar`): instalación aislada, hooks `post-*` en `.githooks/` junto a `pre-push` y `pre-commit`, y `scripts/graphify` con lista blanca | Orienta a los agentes sin leer archivo por archivo. Solo indexa código por AST: nada sale del repo hacia un modelo. Los `.md`, `.sql` y `frontend/public/` quedan fuera |
