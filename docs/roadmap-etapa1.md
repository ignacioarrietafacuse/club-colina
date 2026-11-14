# Roadmap Etapa 1 — plan de sesiones paralelas de Claude Code

**Fecha:** 2026-11-11 (v2: alineado con `flujo-de-trabajo.md`). Implementa la Etapa 1 del PRD v1.1 (`Club_Colina_PRD_Arquitectura_v1.1.md`) y el diseño `diseno-credenciales-qr.md`.
En el monorepo vive en `docs/`, junto al PRD, el diseño de credenciales y `flujo-de-trabajo.md`. Todas las sesiones trabajan según `flujo-de-trabajo.md`.

## Mapa

```
Ola 0  Cimientos y contrato        1 sesión (Fable u Opus)     secuencial
Ola 1  Construcción                5 sesiones (Sonnet)         en paralelo
Ola 2  Integración, QA, seguridad  1 sesión                    secuencial
Ola 3  Dominio, importación, piloto, lanzamiento   Ignacio + Mony + 1 sesión
```

La Ola 1 solo puede ir en paralelo porque la Ola 0 deja fijados el contrato de la API, el esquema de datos y el esqueleto de rutas. Esa es la regla que evita conflictos.

## Decisiones técnicas (se fijan en la Ola 0)

| Tema | Decisión | Por qué |
|---|---|---|
| Monorepo | pnpm workspaces: `frontend/`, `backend/`, `shared/`, `docs/` | `shared/` agrega una carpeta al PRD, pero es lo que permite trabajar front y back en paralelo |
| Contrato | `shared/` con esquemas zod y tipos de cada endpoint. Front y back importan de ahí | Si alguien rompe el contrato, falla la compilación |
| Mismo origen | Vercel reescribe `/api/*` al backend en Railway | Cookies de sesión propias (first-party) tanto en `*.vercel.app` como en `panel.clubcolina.com`, sin CORS. Un solo registro DNS |
| Frontend | SPA con Vite + TanStack Router (rutas por archivo), sin TanStack Start, Nitro ni nada de Lovable (decisión de Ignacio, 2026-11-11) | El SSR de Lovable no aporta nada acá; una SPA estática en Vercel es lo más simple y no deja funciones de servidor |
| Fotos | Se comprimen en el navegador (lado mayor 1024 px, JPEG ~80 %) antes de subir | Subidas rápidas desde el celular y evita límites de tamaño en el proxy |
| Fotos en Postgres | Tabla `fotos` aparte (id, mime, bytes, creado_en); las fichas apuntan con `foto_id`. Se sirven solo a través del backend. Sin volumen de fotos (decisión de Ignacio, 2026-11-11) | Un solo volumen y un solo respaldo; la foto y su ficha no se desincronizan; las listas no arrastran bytea. Son ~70 MB |
| Auth | Usuario y contraseña (argon2), tabla `sesiones`, cookie httpOnly. Usuarios creados por script | Lo más simple que es seguro para 1 o 2 usuarios |
| Base de datos | Drizzle ORM; migraciones SQL en `backend/migrations/` | Esquema tipado y migraciones legibles |
| QR | Se genera en el navegador (librería `qrcode`) desde `{BASE_URL}/c/{credencial_token}` | El backend no genera imágenes |
| URL base | Variable de entorno `PUBLIC_BASE_URL` | Se cambia al dominio final en la Ola 3 sin tocar código |
| Envíos | Ni correo ni WhatsApp en la Etapa 1 | El link privado se muestra en pantalla; Mony lo copia desde el panel si alguien lo pierde |
| Respaldos | Diario y semanal en Railway, para el volumen de Postgres (que guarda también las fotos) | Ver `flujo-de-trabajo.md` |

## Contrato de la API

Cerrado en la Ola 0 y aprobado por Ignacio (2026-11-11). La versión que vale es la de
`shared/src/contrato.ts`; esta lista es un resumen. Cambios respecto del borrador: se
agregan `GET /api/public/categorias` y `POST /api/panel/:tipo/:id/activar`, y
`GET /api/panel/fotos/:id` pasa a ser `GET /api/panel/:tipo/:id/foto`.

**Público** (sin login)
- `POST /api/public/rut-lookup` `{rut}` → si está precargado, el tipo y qué campos faltan, más el primer nombre de los hijos y sus faltantes. Nunca devuelve datos guardados ni ids: los hijos precargados van por posición, que el servidor recalcula desde el RUT al recibir la solicitud. Con límite de intentos. Un jugador que no es adulto con certeza responde como RUT desconocido (2026-11-12).
- `POST /api/public/solicitudes` (multipart: datos + fotos) → `{token_acceso, otros_apoderados}` con los links de `/completar`. Es la única vez que se entregan: la base guarda solo su hash. Calcula los avisos de suplantación para el panel.
- `GET /api/public/familia/:token_acceso` → estado de la solicitud y de cada persona que llegó en ella, nunca el resto de la familia de la base (nombre, rol, estado y `credencial_token` si está activa).
- `GET /api/public/categorias` → `[{id, nombre, disciplina}]`, para cuando el formulario tiene que preguntar la categoría. Se quitó el 2026-11-14: la categoría se calcula por edad de temporada y el formulario ya no la pregunta (ver `diseno-credenciales-qr.md`).
- `GET|POST /api/public/completar/:token` → link personal del segundo apoderado para subir su foto.
- `GET /api/public/credencial/:credencial_token` → `{nombre, rol}` solo si está activa; si no, 404 genérico.
- `GET /api/public/credencial/:credencial_token/foto`.

**Auth**
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.

**Panel** (con login)
- `GET /api/panel/dashboard`: jugadores activos, apoderados, entrenadores, solicitudes pendientes y precargados sin registrarse.
- `GET /api/panel/solicitudes`, `GET /api/panel/solicitudes/:id`, `POST .../:id/aprobar` (por persona: número, becas, método de pago; la categoría se calcula desde el 2026-11-14), `POST .../:id/rechazar`, `POST .../:id/link` (genera un link privado nuevo, anula el anterior y lo devuelve para copiarlo). Listado y detalle traen los `avisos` de posible suplantación.
- `GET|PATCH /api/panel/jugadores[/:id]`, con filtros por estado, "faltan datos" y "sin número (99)".
- `GET|PATCH /api/panel/apoderados[/:id]`.
- `GET|POST|PATCH /api/panel/entrenadores[/:id]`.
- `GET|POST /api/panel/:tipo/:id/foto`, `POST /api/panel/:tipo/:id/regenerar-token`, `POST /api/panel/:tipo/:id/activar`, `POST /api/panel/:tipo/:id/desactivar`.
- `GET /api/panel/categorias`.

## Ola 0 — Cimientos (1 sesión, Fable u Opus)

**Antes de empezar (Ignacio):** crear el repo `ignacioarrietafacuse/club-colina`, el proyecto de Railway y los tokens del entorno de Claude Code.

**Entregables**
1. Los cuatro documentos guardados en `docs/`.
2. El contenido de `cc-frontend` copiado a `frontend/`, sin el historial (el historial queda en el repo archivado).
3. Workspaces pnpm, TypeScript estricto, lint y un script `pnpm check` en la raíz (lint, tipos, tests y build).
4. `backend/`: Fastify con configuración por variables de entorno, conexión a Postgres, logger, `/api/health` y manejo de errores.
5. Esquema Drizzle y migración inicial: `apoderados`, `jugadores`, `jugador_apoderado`, `entrenadores`, `categorias`, `solicitudes_registro`, `usuarios` y `sesiones`. Seed de categorías con la tabla del diseño.
6. Módulos comunes del backend:
   - `rut`: normalizar y validar el dígito verificador, y generar RUT ficticios para tests.
   - `tokens`: 32 bytes aleatorios en base64url.
   - `fotos`: guardar, leer y borrar en Postgres (tabla `fotos`), verificando el tipo por contenido.
   - Límite de intentos (`@fastify/rate-limit`).
   - Todos con tests.
7. `shared/` con el contrato completo en zod.
8. **Esqueleto de rutas.** En el backend, los plugins `auth`, `panel` y `public` registrados y vacíos. En el frontend, el router con todas las rutas declaradas apuntando a páginas vacías: `/login`, el panel, `/registro`, `/familia/:token`, `/completar/:token` y `/c/:token`.
9. Todo lo de la sección "Qué instala la Ola 0" de `flujo-de-trabajo.md`: hooks, permisos, agente revisor, CI, plantilla de PR, guarda de host y `CLAUDE.md` con la tabla de propiedad de carpetas de la Ola 1.
10. Deploy:
    - Railway: Postgres y el servicio backend (despliegue automático desde `main`, healthcheck en `/api/health`), con respaldos diario y semanal en el volumen de Postgres (las fotos van dentro). El backend aplica las migraciones al arrancar, sin configuración de Railway.
    - Vercel: apuntando a `frontend/`, con la reescritura de `/api`.
    - Prueba rápida: `/api/health` y la subida de una foto de prueba ficticia desde la URL de `vercel.app`, que después se borra.

**Listo cuando:** Ignacio aprobó el contrato y el esquema, `pnpm check` pasa, el PR está fusionado y el deploy está en verde y verificado.

## Ola 1 — Construcción (5 sesiones en paralelo, Sonnet)

Reglas para todas:
- Cada sesión trabaja en su propia rama y solo toca sus carpetas.
- Si necesita cambiar `shared/` o una migración, se detiene y lo reporta.
- Tests de lo que construye. Termina con `pnpm check` en verde.
- Revisión por subagente según el tamaño del cambio, y después la propia sesión fusiona su PR, siguiendo `flujo-de-trabajo.md`: de a un PR a la vez, con `git fetch` antes y esperando el despliegue en verde.

| Sesión | Rama | Carpetas propias | Alcance |
|---|---|---|---|
| S1 Backend panel | `backend-panel` | `backend/src/routes/auth/`, `backend/src/routes/panel/`, `backend/src/services/panel/`, `backend/scripts/crear-usuario.ts` | Login y sesiones, endpoints del panel, aprobar y rechazar (estados, vínculos, generación de `credencial_token`), revocar y regenerar, dashboard. Tope de intentos de login solo por IP, además de usuario + IP, sin que uno anule al otro. Test obligatorio: muchos intentos seguidos al mismo usuario desde la misma IP en la ruta con los dos límites. |
| S2 Backend público | `backend-publico` | `backend/src/routes/public/`, `backend/src/services/registro/` | Consulta de RUT, creación de solicitudes (paso de precargado a pendiente, hijo inscrito por dos apoderados, casilla "Ya no está en el club"), link de familia, link del segundo apoderado, verificación. Tests de que ninguna respuesta pública filtra RUT, teléfono ni fechas |
| S3 Importación | `importacion` | `backend/scripts/importar-base-2026.ts` y sus tests | Script idempotente (llave: RUT), con `--dry-run`, siguiendo las reglas de la sección "Carga inicial" del diseño. Tests con datos sintéticos, nunca con la planilla real. Imprime un resumen de cargados y omitidos con el motivo, sin datos personales |
| S4 Frontend panel | `frontend-panel` | `frontend/src/pages/panel/`, `frontend/src/components/panel/`, `frontend/src/lib/api/` | Quitar todos los mocks, dejar las secciones de la Etapa 2 como "Pendiente", login, solicitudes, jugadores, apoderados, entrenadores, descarga del QR en PNG de cualquier persona activa, dashboard |
| S5 Frontend público | `frontend-publico` | `frontend/src/pages/public/`, `frontend/src/components/public/` | Formulario por pasos según el diseño, compresión de fotos, link de familia con los QR, link del segundo apoderado, página `/c/:token`. Pensado primero para celular |

`frontend/src/lib/api/` (el cliente tipado) lo crea S4. S5 lo usa en modo solo lectura y, si le falta algo, lo pide.

**Orden de fusión sugerido:** S3 → S2 → S1 → S5 → S4. Si una sesión termina antes que la anterior, puede fusionar igual, trayendo `main` solo si hay conflicto.

## Ola 2 — Integración y QA (1 sesión)

- Prueba de punta a punta en local (Postgres en Docker) y corrección de diferencias con el contrato.
- Verificación en producción, todavía en `vercel.app`. Confirmar que los respaldos diario y semanal están activos y probar una restauración.
- Checklist de QA:
  - Registro con RUT precargado, con RUT nuevo, de un jugador adulto, con segundo apoderado, y de un hijo inscrito por dos apoderados.
  - Aprobación parcial y total. Escaneo de un QR activo, de uno inválido, de uno revocado y de uno pendiente.
  - RUT duplicado, dígito verificador inválido, foto faltante y límite de intentos.
  - Número 99 y la casilla "Ya no está en el club".
- Revisión de seguridad por un subagente sin contexto: rutas públicas, autenticación, servicio de fotos y datos de menores (Ley 21.719).
- Los datos ficticios usados en la verificación de producción se borran antes de la Ola 3.

## Ola 3 — Salida (Ignacio, Mony y una sesión)

1. Llamada con Mony: agregar el CNAME `panel` → Vercel. Antes, revisar si hay correo o web en `clubcolina.com`, para no tocarlos. (Pide el OK de Ignacio.)
2. Cambiar `PUBLIC_BASE_URL` a `https://panel.clubcolina.com` y verificar HTTPS.
3. Crear los usuarios del panel con el script.
4. Importación en producción: respaldo manual, `--dry-run`, revisar el resumen y luego en real. (Pide el OK de Ignacio.)
5. Piloto con 3 a 5 familias y prueba de escaneo en el Pucalán.
6. Mony carga a los entrenadores y lanza el link en los grupos.

**No se reparte ningún QR antes del paso 2:** la URL queda grabada en el código QR.
