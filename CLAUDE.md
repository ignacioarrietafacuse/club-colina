# Club Colina — instrucciones para Claude Code

Sistema a medida para Club Basketball Colina y Club Voleibol Colina. Monorepo pnpm:
`frontend/` (SPA en Vercel), `backend/` (Fastify en Railway), `shared/` (contrato en zod)
y `docs/`.

**Antes de tocar nada, lee [`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md).** Ahí está
cómo se trabaja: ramas, tamaños de cambio, revisión por subagente, CI, despliegues,
migraciones, respaldos y datos reales. Las fuentes de verdad del producto son
`docs/Club_Colina_PRD_Arquitectura_v1.1.md`, `docs/diseno-credenciales-qr.md` y
`docs/roadmap-etapa1.md`.

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

## Comandos

```bash
pnpm install          # instala y activa los hooks de .githooks/
docker compose up -d  # Postgres local (club_colina y club_colina_test)
cp .env.example .env  # siempre apuntando a localhost
pnpm --filter @club-colina/backend migrar
pnpm --filter @club-colina/backend dev   # backend en :3000
pnpm --filter @club-colina/frontend dev  # frontend en :5173 (reenvía /api)
pnpm check            # lint, tipos, tests y build: tiene que pasar antes de empujar
```

Las CLI de Railway y Vercel están como devDependencies de la raíz: se usan siempre con
`pnpm exec railway ...` y `pnpm exec vercel ...`, nunca instaladas globalmente.

Las migraciones se generan desde `backend/src/db/schema.ts` con
`pnpm --filter @club-colina/backend db:generar`. Una migración aplicada nunca se edita.
El backend las aplica solo al arrancar (`backend/src/server.ts`, antes de escuchar el puerto), con
`NODE_ENV=production` y `MIGRAR_AL_ARRANCAR=si` puestas en Railway. Si una falla, no escucha el
puerto, y el healthcheck `/api/health` del panel de Railway mantiene la versión anterior. No hay
`railway.json`. **Nunca levantar el servidor con las variables de producción fuera de Railway**
(`railway run` sobre el servidor): migraría producción con el código de una rama. Una migración que borra, renombra o cambia tipos
necesita respaldo manual y el OK de Ignacio, y lleva la línea
`-- destructiva-aprobada: AAAA-MM-DD`; sin ella el test `migraciones.test.ts` frena el PR.

Los tests del backend usan `TEST_DATABASE_URL` (nunca `DATABASE_URL`) y vacían esa base
entera: tiene que estar en localhost y llamarse `*_test`.

## Ola 1: propiedad de carpetas

Cada sesión trabaja en su rama y **solo toca sus carpetas**. Lo que no está en la tabla
es de la Ola 0 y queda fijo.

| Sesión | Rama | Carpetas propias |
|---|---|---|
| S1 Backend panel | `backend-panel` | `backend/src/routes/auth/`, `backend/src/routes/panel/`, `backend/src/services/panel/`, `backend/scripts/crear-usuario.ts` |
| S2 Backend público | `backend-publico` | `backend/src/routes/public/`, `backend/src/services/registro/` |
| S3 Importación | `importacion` | `backend/scripts/importar-base-2026.ts` y sus tests |
| S4 Frontend panel | `frontend-panel` | `frontend/src/pages/panel/`, `frontend/src/components/panel/`, `frontend/src/lib/api/` |
| S5 Frontend público | `frontend-publico` | `frontend/src/pages/public/`, `frontend/src/components/public/` |

**Tienen un solo dueño a la vez; si una sesión necesita cambiarlos, se detiene y avisa:**
`shared/` (el contrato), `backend/migrations/` y `backend/src/db/schema.ts`, los
`package.json` y `pnpm-lock.yaml` (dependencias), `frontend/src/routes/`,
`backend/src/app.ts` y `backend/src/lib/`.

`frontend/src/lib/api/` lo crea S4; S5 lo usa en modo solo lectura y, si le falta algo,
lo pide.

### Notas del contrato para la Ola 1 (decisiones de Ignacio, 2026-11-11)

- **Fotos en Postgres**, tabla `fotos` aparte; las fichas apuntan con `foto_id`. Usar
  `backend/src/lib/fotos.ts` (`guardarFoto`, `leerFoto`, `borrarFoto`). No hay volumen de fotos.
- **`numero_camiseta` es texto** (`^[0-9]{1,2}$`): "0" y "00" son distintos. "99" = sin número asignado.
- **Consulta de RUT (S2):** nunca devuelve ids. Los hijos precargados van con `posicion`: los
  vínculos del apoderado en `jugador_apoderado`, sin filtrar por estado, ordenados por
  `jugador_apoderado.creado_en, jugador_id`. Se ocultan los vínculos pendientes que creó una
  solicitud hacia un hijo que no llegó en esa misma solicitud (un jugador que ya existía, nombrado
  por RUT); aparece cuando Mony aprueba el vínculo. Un jugador que no es adulto con certeza (menor,
  o sin fecha en la base) responde igual que un RUT desconocido (`encontrado: false`): si su apoderado lo nombra por RUT, el formulario pide todo
  y el servidor completa solo lo que falta. La solicitud los nombra con `ref.precargado` y el
  `primer_nombre` que vio; al recibirla, el servidor recalcula la lista desde el RUT de quien llena
  y responde 409 `conflicto` si la posición no existe o el nombre no coincide. Ignora la tabla `entrenadores`. Si un RUT es apoderado y
  jugador adulto a la vez, el formulario lo trata como apoderado; Mony completa la parte
  de jugador en el panel.
- **Apoderado ya registrado (S2):** puede volver a usar el formulario para agregar hijos
  nuevos (y otro apoderado). `rut-lookup` responde `ya_registrado: true` y `solicitudes`
  acepta solo `hijos` y `otro_apoderado`, sin pedir ni modificar sus datos. Nunca 409 por eso.
- **`POST /api/panel/:tipo/:id/activar` (S1):** activa a un precargado que Mony completó en
  el panel o reactiva a un inactivo. Exige lo mismo que la aprobación y genera un
  `credencial_token` nuevo.
- **QR en el panel (S4):** se puede descargar en PNG para **cualquier persona activa**
  (jugador, apoderado o entrenador), no solo entrenadores. URL: `urlCredencial()` de `shared/`.
- **Logs:** el logger escribe el patrón de la ruta (`/api/public/familia/:token`), nunca la URL
  ni su consulta (el buscador `?q=` lleva RUT y nombres), y un `{ err }` sin texto recibe un
  mensaje fijo (`backend/src/lib/logs.ts`). No loguear params, query, cuerpos ni cabeceras.
- **Límite de intentos:** `LIMITES` en `backend/src/lib/limite-intentos.ts`; cada ruta lo
  activa con `config: { rateLimit: LIMITES.x }`. La llave es `ipCliente()`: `x-club-colina-ip` solo
  si la petición trae el secreto del middleware de Vercel (`frontend/middleware.ts`, `PROXY_SECRETO`
  en Railway y en Vercel Production); si no, `x-real-ip`, que pone el borde de Railway. IPv6 se
  agrupa por /64. Nunca `X-Forwarded-For` ni `trustProxy`. El login usa
  `config: { rateLimit: LIMITES.login }` (usuario + IP); el trabajo caro (argon2, la base) va en el
  handler. S1 normaliza el usuario igual que la llave (`trim().toLowerCase()`) y agrega el tope solo
  por IP (ver el alcance de S1 en el roadmap): dos límites en la misma ruta se anulan si se suman
  sin cuidado.
  Las rutas multipart de S1 y S2 traen tests por `app.inject` con el 400 `archivo_invalido` y el 413.
- **Escrituras:** el backend rechaza POST/PUT/PATCH/DELETE con un `Origin` que no sea
  `PUBLIC_BASE_URL` u `ORIGENES_PERMITIDOS`. Las vistas previas de Vercel quedan en solo lectura y
  sin login a propósito (decisión de Ignacio, 2026-11-12): el panel se prueba en local.
- **Entrada:** se valida con `validarEntrada(esquema, datos)` (`backend/src/lib/validar.ts`),
  que responde 400 `validacion` con los nombres de los campos. Un `ZodError` suelto es un
  error del servidor (500).
- **Respuestas:** toda respuesta se arma con `respuesta(esquemaResponse, datos)`, que pasa
  por el contrato y descarta cualquier campo que no esté ahí. Obligatorio en `/api/public`.
- **Errores:** lanzar `ErrorApi` (`backend/src/lib/errores.ts`). El logger nunca registra el
  mensaje de un error (drizzle mete ahí los parámetros de la consulta): solo tipo, código
  SQLSTATE, restricción, tabla y stack (`resumirError`).
- **Panel cerrado por defecto:** `rutasPanel` responde 401 a todo `/api/panel/*` y
  `guardaPanel` manda a `/login`. S1 y S4 los reemplazan por la verificación real de sesión,
  sin dejar ninguna ruta afuera.
- **Fotos:** `guardarFoto` borra los metadatos (EXIF, GPS, XMP, comentarios) antes de guardar.
  Al servirlas: `Cache-Control: private, no-store` (el backend ya agrega `nosniff`).
- **Scripts que escriben:** llaman a `verificarHostDestino()` (`backend/src/lib/guarda-host.ts`)
  antes de conectarse.
- **Links privados (S1, S2):** `solicitudes_registro.token_acceso_hash` guarda `hashToken()` del
  link de `/familia` (o de `/completar` en una solicitud de segundo apoderado); el link se compara
  buscando por su hash. Se entrega una sola vez, en `solicitudCreadaResponse`; `POST
  .../solicitudes/:id/link` genera uno nuevo y anula el anterior. `credencial_token` va en claro.
- **`/familia` (S2):** solo las personas con ese `solicitud_id`, más los hijos cuyo vínculo creó
  esa solicitud (`jugador_apoderado.solicitud_id`) una vez que Mony lo aprobó (vínculo `activo`).
  Nunca el resto de la familia de la base. `solicitud_id` de una persona se asigna solo si está
  en NULL (persona nueva, o precargada del RUT de quien llena) y **nunca se reasigna**: un hijo
  que ya existía y se nombró por RUT entra solo por su vínculo, y no aparece hasta que Mony lo
  aprueba. A un hijo marcado "ya no está" no se le asigna `solicitud_id`; la marca es solo una
  señal para Mony y no lo saca de ningún `/familia` (lo saca la baja en la ficha). S2 cubre esto con un
  test (un RUT ajeno nombrado en la solicitud no devuelve su nombre ni su `credencial_token`).
- **Tipos de link (S2):** `/familia` busca el hash solo entre solicitudes `tipo = 'formulario'` y
  `/completar` solo entre `tipo = 'segundo_apoderado'`; en cualquier otro caso, 404 genérico. Con test.
- **Segundo apoderado (S2):** tiene su propia fila en `solicitudes_registro` (`tipo
  segundo_apoderado`, con `solicitud_origen_id` = la solicitud que lo agregó) y su `solicitud_id`
  apunta a esa fila suya. `otros_apoderados` de `/familia` sale de las solicitudes con
  `solicitud_origen_id` = la actual. Solo un otro apoderado **nuevo** recibe esa fila y su link:
  si su RUT ya existía (también precargado), queda solo el vínculo pendiente y el aviso
  `otro_apoderado_ya_registrado`, sin link ni datos suyos en la respuesta (2026-11-12).
  `GET /completar/:token` devuelve su `credencial_token` cuando está activo (solo el suyo).
- **Avisos de suplantación (S2 calcula, S1 y S4 muestran):** `solicitudes_registro.avisos` con los
  valores de `AVISOS_SOLICITUD`, sin repetidos; S2 los calcula al recibir la solicitud y, si
  involucra a personas de una solicitud pendiente anterior, le agrega a esa `hay_solicitud_posterior`.
- **Datos de prueba:** siempre ficticios, con `generarRutFicticio()` de `shared/`.

<!-- graphify-estandar:inicio -->
## Grafo del código (graphify)

- Antes de buscar archivo por archivo, mira `graphify-out/GRAPH_REPORT.md` y usa
  `scripts/graphify query "…"`, `scripts/graphify path A B` o `scripts/graphify explain X`.
  Siempre `scripts/graphify`, sin `./` delante. El graphify aislado de Club Colina no está en
  el PATH a propósito: `scripts/graphify` lo resuelve y solo deja pasar lo permitido. El
  `graphify` del PATH está denegado en `.claude/settings.json`.
- Hay un solo grafo, en la raíz del repo (`graphify-out/` está en `.gitignore`).
- El grafo orienta; las conclusiones se verifican en el código. Solo indexa código (los `.md`
  quedan fuera).
- En la nube el grafo se construye solo al iniciar la sesión, en segundo plano; puede tardar
  unos segundos. Si `graphify-out/` no existe, sigue normal: no instales graphify ni
  construyas el grafo a mano. Única excepción: en la nube (`CLAUDE_CODE_REMOTE=true`), si no
  existe el archivo `graphify-sesion` dentro de la carpeta de git del repo
  (`git rev-parse --git-path graphify-sesion`), el hook de inicio no corrió (pasa en sesiones
  con varios repositorios, donde la nube no carga los hooks del repo): lánzalo tú una vez, en
  segundo plano y sin esperarlo, con `.claude/hooks/graphify-session-start.sh` desde la raíz
  de este repo. Localmente lo deja `scripts/setup-dev.sh`.
- Solo `scripts/graphify update .` o `scripts/graphify extract . --code-only`. Prohibido: el
  skill `/graphify` (el repo lo deniega), el `graphify` del PATH, `extract` sin `--code-only`,
  `--mode deep`, `--obsidian`, `graphify hook install`, `graphify install` y comitear
  `graphify-out/`. graphify no envía nada del repo a un modelo ni a terceros: nada que mande
  docs, imágenes o código a un modelo.
- Las reglas deny calzan con todo el texto del comando: si un mensaje de commit menciona la ruta
  de instalación, usa `git commit -F`. Para inspeccionar la instalación o los logs
  (`~/.cache/club-colina-graphify/`), usa Read/Glob/Grep, no Bash: el deny `*-graphify/*` también
  tapa los logs, y los deny de `GRAPHIFY_BIN` calzan con cualquier texto que lo contenga.
<!-- graphify-estandar:fin -->
