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
- Si la segunda ronda encuentra hallazgos de fondo y la sesión ya los corrigió con tests, puede hacer una tercera ronda sin preguntar, solo sobre ese delta y con los mismos ángulos que encontraron el problema. Si la tercera ronda queda limpia, fusiona. Si encuentra algo de fondo, para y avisa a Ignacio. Nunca hay una cuarta ronda.
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

Un solo trabajo en `.github/workflows/ci.yml` que corre `pnpm check` (lint, tipos, tests y el build de todo, `pnpm build:todo`).

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
  - `post-checkout`, `post-commit`, `post-merge`, `post-rewrite` y `post-applypatch` (con `lib-graphify.sh`): no son reja. Solo reconstruyen el grafo de graphify y nunca hacen fallar una operación de git.
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
2. **Railway no espera al chequeo de `main`** ("Wait for CI" está apagada: riesgo aceptado, ver la bitácora del 2026-11-12). Solo se fusiona con el chequeo del PR en verde. **El backend aplica las migraciones pendientes al arrancar**, antes de escuchar el puerto (`backend/src/server.ts`), solo con `NODE_ENV=production` y `MIGRAR_AL_ARRANCAR=si` (puestas en el servicio de Railway). Si una falla, el proceso termina con error y no escucha el puerto. Que Railway mantenga la versión anterior depende del **healthcheck en `/api/health` configurado en el panel del servicio**: el repo ya no lo fija. Con una sola instancia es seguro, y un candado de Postgres evita que dos arranques superpuestos migren a la vez. Nunca levantar el servidor con las variables de producción fuera de Railway (`railway run` sobre el servidor): migraría producción con el código de una rama.
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
- Railway: despliegue automático desde `main` (sin "Wait for CI", riesgo aceptado), healthcheck en `/api/health`, variables `NODE_ENV=production`, `MIGRAR_AL_ARRANCAR=si` y `PROXY_SECRETO` (el mismo valor que en Vercel), y respaldos diario y semanal en el volumen de Postgres. Build y arranque los detecta Railpack desde los scripts `build` y `start` de la raíz; `build` compila solo el backend (tsup, que empaqueta `shared/` adentro) y revisa los tipos de `shared/`; el frontend lo compila Vercel desde `frontend/`. Las migraciones no se configuran en Railway: las corre el backend al arrancar.
- Vercel: confirmar que solo `main` publica a producción. `PROXY_SECRETO` (sensible) solo en Production, nunca en Preview: las vistas previas corren código no fusionado. Un cambio de variable en Vercel llega al middleware recién con un despliegue nuevo. Para rotarlo: cambiarlo en Railway y en Vercel y redesplegar los dos; mientras no coincidan, todo el tráfico comparte un contador (el log muestra `"proxy":false`). Para volver atrás: quitarlo en Vercel y redesplegar, y el middleware deja de actuar.

**Pendientes no bloqueantes** (al 2026-11-12):
- Railway, "Wait for CI": está **apagada**, y queda así como riesgo aceptado (decisión de Ignacio, 2026-11-12). El panel de Railway no tiene ese interruptor; solo existe en la API (`deploymentTriggerUpdate(input: { checkSuites: true })` sobre el disparador del servicio `club-colina`). Medido por la API: `checkSuites: false` y `validCheckSuites: 1`, es decir, Railway sí ve el check de GitHub. Mitigación: solo se fusiona con el chequeo del PR en verde, y Railway compila solo el backend.
- El logo del club: el original vive en `frontend/src/assets/fuente/logo-colina.jpg` (JPG de 270x148; nada lo importa y no entra al build). Los íconos, la og-image y los logos de la interfaz salen de ahí con `pnpm --filter @club-colina/frontend generar:iconos` (`frontend/scripts/generar-iconos.mjs`). Cuando llegue un PNG grande o un SVG: se guarda en esa misma carpeta como `logo-colina.png` o `logo-colina.svg`, se borra el JPG, se corre `generar:iconos` y se revisa a ojo el favicon (la "C" recortada) antes de comitear.
- `VITE_PUBLIC_BASE_URL` (la dirección que va en los QR) vive en tres lugares: Vercel Production (`https://panel.clubcolina.com` desde el 2026-11-13), Vercel Preview y `.github/workflows/ci.yml` (los dos siguen con `https://club-colina.vercel.app`, que redirige al dominio del club). Railway ya no la necesita (ver la bitácora, 2026-11-12). Ninguna variable secreta lleva el prefijo `VITE_`: Vite la mete en el bundle público.

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
| 2026-11-12 | La llave del límite de intentos es la IP real: la que el middleware de Vercel toma de su borde (`x-club-colina-ip`) solo si viene con el secreto, si no `x-real-ip`; IPv6 por /64 | Medido en producción: el borde de Railway reescribe `x-real-ip`, pero por Vercel esa IP es la de salida de Vercel (compartida), y quien llama directo a Railway puede inventar cualquier otra cabecera. El secreto (`PROXY_SECRETO`) distingue los dos caminos |
| 2026-11-12 | Dos límites de intentos en la misma ruta necesitan un test con la misma clave en los dos | `@fastify/rate-limit` marca la petición como contada en el primer límite que corre: un segundo límite en la misma ruta no cuenta nunca. La revisión lo encontró con un test que cambiaba de usuario en cada intento y por eso no lo veía |
| 2026-11-12 | Grafo de código con graphify (estándar `graphify-estandar`, versión fija en `.graphify-version`): instalación aislada, hooks `post-*` en `.githooks/` junto a `pre-push` y `pre-commit`, y `scripts/graphify` con lista blanca. En `.claude/settings.json`: `allow` para `scripts/graphify`, `scripts/setup-dev.sh` y las dos baterías; `deny` para cualquier otra forma de llamar a graphify; un hook `PreToolUse` (Bash, Grep, Read y Glob) que solo da un aviso, y un `SessionStart` que en la nube instala graphify y arma el grafo. En local hace falta `uv` y correr `scripts/setup-dev.sh` una vez | Orienta a los agentes sin leer archivo por archivo. Solo indexa código por AST: nada sale del repo hacia un modelo. Quedan fuera los `.md`, `.sql`, `package.json`, `tsconfig*.json`, `frontend/public/` y `backend/migrations/` |
| 2026-11-12 | `rut-lookup` responde `encontrado: false` para un jugador menor y oculta los vínculos pendientes hacia hijos que no llegaron en la misma solicitud | Quien conoce o inventa un RUT no puede averiguar el nombre de un menor del club, ni el de un menor ajeno que nombró en su propio formulario, antes de que Mony apruebe |
| 2026-11-12 | Verificado en producción: el límite de `rut-lookup` responde 429 por Vercel aunque cada pedido traiga un `x-real-ip` inventado distinto (400 pedidos con un RUT ficticio fijo que no está en la base: 373 con 200 y 27 con 429; logs con `"proxy":true`) | Cierra la comprobación pendiente de la Ola 0. La salida de red de las sesiones de Claude rota entre varias IP, cada una con su contador, así que desde una sesión el 429 tarda varios cientos de pedidos y los números no son exactos. Con un `x-real-ip` falso fijo el contador no baja de a uno: la cabecera se ignora. Para repetirla sin ruido, hacerla desde una sola IP de salida: 31 pedidos y el 429 en el último |
| 2026-11-12 | Tercera ronda de revisión sin preguntar, acotada al delta corregido con tests y con los mismos ángulos; si encuentra algo de fondo se para, y nunca hay cuarta | Dos sesiones pararon el mismo día por este caso (#14 y #16), y en los dos la tercera ronda acotada era la respuesta obvia |
| 2026-11-12 | Riesgo aceptado: `solicitudes` con `tipo: jugador_adulto` responde 409 si el RUT es de un menor, de un precargado sin fecha, de un jugador con apoderado o de un apoderado, y 201 si no. Eso deja ver que el RUT está en la base | Para averiguarlo hay que mandar el formulario completo con foto, el límite de intentos frena la enumeración, y cada 201 deja una solicitud que Mony ve en el panel. Cerrarlo del todo obligaría a aceptar solicitudes que después no se pueden aprobar |
| 2026-11-12 | Riesgo aceptado: los tokens de `/familia`, `/completar` y `/c` quedan en los logs de borde de Railway y Vercel, que registran la URL completa | Solo los ve quien ya tiene acceso a la base. Sacarlos de la URL que llega al servidor (por ejemplo, al fragmento `#`) cambiaría el formato del QR ya impreso, y no vale la pena ahora. Nuestro propio logger escribe solo el patrón de la ruta |
| 2026-11-12 | Dos avisos nuevos: `hijo_precargado_completado_por_rut` y `cambios_bloqueados_por_otra_solicitud`. Migración 0003 aprobada como destructiva (`DROP CONSTRAINT`) | Solo amplía la lista del CHECK de `avisos`: todas las filas actuales la cumplen y el código en producción solo escribía avisos que ya existían. Una vez guardado un aviso nuevo, volver al despliegue anterior deja el listado de solicitudes del panel en 500 (el contrato viejo no lo conoce): la salida es avanzar con un arreglo, no volver atrás |
| 2026-11-12 | `/familia` acepta al titular apoderado solo si está `pendiente` o `activo` (lista de permitidos, no de excluidos) | Un estado nuevo, o un titular cuya ficha S1 restauró a `precargado` al rechazar, no entrega QR de hijos por descuido |
| 2026-11-12 | `pnpm build` de la raíz compila solo `backend/` y `shared/`; `pnpm check` compila todo con `pnpm build:todo`. `VITE_PUBLIC_BASE_URL` se quita de Railway | Railpack corría `pnpm -r build` y compilaba también el frontend, por lo que Railway necesitaba una variable del frontend. Vercel compila el frontend desde `frontend/` con su propio `pnpm build` y no cambia |
| 2026-11-12 | Revisión de seguridad completa de la Ola 2 (subagente sin contexto). Corregido: el panel y la sesión responden sin caché (#38). Propuesto, a la espera del OK de Ignacio porque cambia lo que el formulario le pide al precargado: comparar siempre el teléfono del apoderado precargado (#36). Riesgos aceptados, abajo. Quedan para decisión de Ignacio: qué pasa con una persona nueva rechazada (hoy queda `rechazado` para siempre, con su RUT tomado y sus datos y foto sin plazo de borrado) y si `/familia` muestra a los hijos nombrados por RUT mientras la solicitud está pendiente | Ninguna ruta pública filtra RUT, teléfono, correo, fechas ni ids, y ninguna ruta del panel queda sin sesión. Lo que queda abierto es de producto o de retención (Ley 21.719), no de código |
| 2026-11-12 | Riesgo aceptado: el buscador del panel lleva `?q=` (RUT, nombres, teléfonos) en la URL, que queda en los logs de borde de Vercel y Railway | Es el mismo razonamiento que para los tokens: solo lo ve quien ya tiene acceso a la base. Nuestro logger escribe solo el patrón de la ruta. Pasarlo a `POST` cambiaría el contrato del panel sin ganar nada frente a quien ya administra la plataforma |
| 2026-11-12 | Riesgo aceptado: `/familia` deja ver si un RUT nombrado como hijo ya era jugador (un hijo nuevo aparece pendiente; uno que ya existía no aparece), hasta 8 RUT por envío | Es el mismo dato que el 409 de `jugador_adulto` ya aceptado. Exige mandar el formulario completo con una foto por hijo, el límite de intentos lo frena (10 por hora por IP) y cada envío deja una solicitud visible para Mony. Cerrarlo obligaría a ocultar a todos los hijos pendientes en `/familia` (decisión de producto, ver la fila anterior) |
| 2026-11-12 | Riesgos menores anotados, sin acción por ahora: el pool de Postgres no tiene `lock_timeout` ni `statement_timeout` (solicitudes en paralelo pueden ocupar conexiones esperando el candado); el login no tiene tope por usuario independiente de la IP ni registra en el log los intentos fallidos; un login nuevo no cierra las sesiones anteriores; las fotos no se recodifican (se borran EXIF, GPS, XMP y textos, pero quedan perfiles de color y bloques desconocidos) | Con el volumen de un club y contraseñas de 12 caracteres con argon2id, ninguno es explotable en la práctica. Se revisan si cambia el volumen o aparece un incidente |
| 2026-11-12 | Respaldos verificados por la API de Railway: diario a las 02:32 UTC (6 días) y semanal los sábados a las 02:45 UTC (27 días), activos en el volumen `postgres-volume`. Restaurar no sobrescribe: monta un volumen nuevo con el respaldo y deja el anterior desmontado en el proyecto, y solo se puede hacer dentro del mismo proyecto y entorno | Un respaldo restaurado en producción cambia el volumen de la base en uso. Por eso la prueba de restauración se hace en un entorno desechable con datos ficticios, y la restauración real pide el OK de Ignacio |
| 2026-11-12 | Riesgo aceptado: "Wait for CI" de Railway queda apagada (no tiene interruptor en el panel, solo en la API) | Se fusiona solo con el chequeo del PR en verde y Railway compila solo el backend: un `main` roto no llega sin que antes falle el PR. `VITE_PUBLIC_BASE_URL` queda en Railway: ya no se usa y es inofensiva |
| 2026-11-12 | Decisiones de Ignacio sobre la Ola 2: (1) una persona nueva rechazada se borra con su foto y sus vínculos en la misma transacción; los precargados vuelven a como estaban; si otra solicitud pendiente todavía la nombra, el rechazo responde 409 y Mony decide primero esa (#40). (2) La marca "ya no está" del formulario es solo una señal para Mony: no saca al hijo de `/familia`, no toca su credencial ni su estado, no impide aprobarlo ni activarlo y no se deshace al rechazar otra solicitud; se aplica siempre. Mony la ve en el dashboard y en la ficha, confirma con la familia y da de baja al jugador, que es lo que lo saca de `/familia`. Una solicitud que trae marcas y no deja nada que decidir queda revisada al crearse, salvo que haya modificado a alguien (dejó copias) o que otra pendiente le haya bloqueado cambios: esa pareja sigue a la vista de Mony (#33). Así una marca falsa no le hace daño a nadie. (3) El formulario pide siempre el teléfono del apoderado titular precargado, para compararlo con la base (#36). (4) Los dos riesgos aceptados de la revisión de seguridad, de acuerdo | Liberar el RUT y no guardar datos de menores sin motivo (Ley 21.719); que la marca no llene la cola de Mony sin esconder la señal de una suplantación; detectar suplantaciones del apoderado precargado. Los datos borrados siguen en los respaldos de Railway hasta que se rotan (6 días el diario, 27 el semanal) |
| 2026-11-12 | Prueba de restauración en un entorno temporal: aprobada por Ignacio, no se pudo hacer desde la sesión | El token de Railway de la sesión es de proyecto y vale solo para `production`: crear un entorno responde "Not Authorized". La prueba la hace Ignacio desde el panel o con un token que alcance al entorno temporal. El respaldo manual "Manual Ola 2 - prueba de restauracion" se conserva hasta entonces |
| 2026-11-12 | Un link de familia solo muestra a las personas que entraron por esa solicitud (su `solicitud_id`): nunca a un niño que ya existía y llegó por un vínculo, aunque Mony lo apruebe, sea cual sea el titular. Con titular ya registrado (aviso `titular_ya_registrado`), solo las personas nuevas que creó (`origen = 'formulario'`), no los precargados de su lista. Al aprobar un vínculo hacia un niño que no aparece en el link, el panel le recuerda a Mony que entregue el QR desde la ficha. Botón "Dar por revisada" para una solicitud pendiente sin nada por decidir: la cierra y borra sus copias en `fichas_previas` (409 si queda algo) | La revisión de seguridad reprodujo que con el RUT de un apoderado registrado (o con un RUT nuevo) se podía nombrar a un niño que ya existía, o a un precargado de la lista por su posición, y ver su nombre, QR y foto si Mony aprobaba. Si el vínculo es legítimo, Mony le entrega ese QR en PNG desde la ficha (no reenvía el link de otra solicitud). Sin el botón, una solicitud cuyos cambios bloqueó otra quedaba pendiente y sin acciones |
| 2026-11-12 | Cambio de clave desde el panel (`POST /api/auth/cambiar-clave`: clave actual + nueva de al menos 12 caracteres y distinta, 5 intentos cada 15 minutos por sesión, cierra todas las sesiones del usuario y le abre una nueva a quien la cambió) y `usuarios.debe_cambiar_clave`: con la marca, el login funciona igual, `/api/panel/*` responde 403 `debe_cambiar_clave` y el panel solo muestra la pantalla de cambiar clave hasta que la cambie. "Salir" queda también en la barra superior del celular | Para entregar usuarios con una clave temporal sin que siga sirviendo después del primer ingreso. Camino vigente: `crear-usuario.ts --temporal`. El primero (Ignacio) va por un INSERT en la consola SQL de Railway porque desde la sesión no se alcanza la base de producción |
| 2026-11-13 | El dominio del club es `clubcolina.com` (no `clubcolina.cl`, que no existe en NIC Chile) y el panel vive en `https://panel.clubcolina.com`: CNAME a Vercel, certificado de Vercel. `VITE_PUBLIC_BASE_URL` de Vercel Production y `PUBLIC_BASE_URL` de Railway pasan a esa dirección; Preview y el CI siguen con `club-colina.vercel.app`. `club-colina.vercel.app` redirige con 308 a `https://panel.clubcolina.com`, conservando la ruta, y `ORIGENES_PERMITIDOS` queda vacía | Una sola dirección para el panel, los links y los QR. La redirección conserva la ruta, así que los links de `/familia` y `/completar` y los QR que ya salieron con `vercel.app` siguen funcionando. El chequeo de `Origin` acepta solo `PUBLIC_BASE_URL` (más `ORIGENES_PERMITIDOS`); la CSP usa `'self'` y las cookies no fijan `Domain`, así que ninguna de las dos depende del dominio |
| 2026-11-13 | Módulo "Suscripción": el club paga su suscripción mensual con Flow y cargo automático (`docs/suscripcion-flow.md`). Flow es la fuente de verdad; Postgres guarda una fila con los ids y el modo. `/api/suscripcion/retorno` es pública y es la única ruta que acepta escrituras con un `Origin` ajeno (`config.origenExterno`) | Flow vuelve con un POST de formulario desde su sitio, sin la cookie de sesión. El retorno no confía en nada de lo recibido: consulta el token en Flow, exige el `customerId` guardado para el modo activo y solo redirige, sin devolver datos |
| 2026-11-14 | Suscripción: si Flow rechaza `customer/create` porque el externalId "club-colina" ya existe (401, código 501, visto en sandbox), inscribir recupera ese cliente con `customer/list` y, si tiene la suscripción vigente, la guarda sin pasar por Flow. "Cobro fallido" se decide por el estado del importe y sus intentos de cobro, no por `due_date` | Si se pierde la fila, Mony no queda bloqueada ni se crea una segunda suscripción con un segundo cobro. Flow no documenta búsqueda por externalId: se filtra por nombre y se compara el externalId exacto; sin un único cliente activo, se mantiene el error. Flow pone `due_date` 3 días después aunque el cobro salga el mismo día |
| 2026-11-14 | La categoría del jugador se calcula siempre por edad de temporada (temporada = año calendario en Chile; UN = edad N−1 o N) y nunca se guarda. `categorias` pasa de años fijos a `edad_min`/`edad_max`, se agrega U19 de básquet y `jugadores.categoria_id` se reemplaza por `u11f_temporada` (la U11 F la marca Mony y vale solo esa temporada). El formulario ya no pregunta la categoría (si falta la fecha o es inválida, pide la fecha); `GET /api/public/categorias` se quita. Migración 0006 aprobada como destructiva por Ignacio, con 0 jugadores en producción, y con una guarda (con candado sobre `jugadores`) que la hace fallar si hay alguno. Excepción a "quitar en dos pasos": borra columnas en el mismo despliegue que deja de usarlas, con respaldo manual antes. Una vez aplicada no hay vuelta al despliegue anterior (el código viejo nombra `categoria_id` y respondería 500): la salida es avanzar con un arreglo o restaurar el respaldo con el OK de Ignacio. La importación no trae la categoría de la base, salvo la U11 F (marca de 2026), y cuenta las de básquet distintas de la calculada | Los años fijos se rompían cada 1 de enero y la categoría guardada quedaba vieja. Las categorías solo sirven para contar jugadores: calcularlas al responder es lo más simple. Se hizo antes de importar la base 2026 para no guardar ninguna categoría |
| 2026-11-14 | Un jugador adulto precargado sin fecha válida en la base y sin apoderados (la consulta de RUT responde `encontrado: false`) llena el formulario completo y su ficha se completa con lo que escribe: nombre, apellido y fecha (adulta) reemplazan los de la base, y lo demás que falte se completa. Mony recibe `adulto_precargado_sin_fecha_en_base` y, si el nombre o el apellido no son los de la base, `nombre_distinto_base`; si rechaza, vuelve la ficha de la base. Migración 0007: amplía el CHECK de `avisos` (como 0003). Se quita la compatibilidad temporal del contrato de 0006 (`u11f`, `edad_min`/`edad_max`, `jugadores_por_categoria` pasan a obligatorios) | Antes daba 409 y el adulto no podía registrarse. La respuesta y `/familia` no dependen de lo que tenía la base: si dependieran del nombre, quien solo tiene el RUT de un posible menor podría probar nombres hasta acertar (revisión de seguridad). La comparación queda solo para Mony: el detalle de la solicitud muestra el nombre que tenía la base (`nombre_en_base`, de la copia previa) hasta que la decide. Vuelta atrás: igual que 0003, un backend anterior responde 500 en el listado del panel si ya hay una solicitud con un aviso nuevo; la salida es avanzar con un arreglo |
