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
Railway las aplica solas al desplegar: una migración que borra, renombra o cambia tipos
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
- **Consulta de RUT (S2):** ignora la tabla `entrenadores`. Si un RUT es apoderado y
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
- **Logs:** el logger censura el token de `/api/public/familia/:token`, `/completar/:token`
  y `/credencial/:token` (`backend/src/lib/logs.ts`). No loguear params, cuerpos ni cabeceras.
- **Límite de intentos:** `LIMITES` en `backend/src/lib/limite-intentos.ts`; cada ruta lo
  activa con `config: { rateLimit: LIMITES.x }`.
- **Escrituras:** el backend rechaza POST/PUT/PATCH/DELETE con un `Origin` que no sea
  `PUBLIC_BASE_URL` u `ORIGENES_PERMITIDOS` (las vistas previas de Vercel quedan en solo lectura).
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
- **Datos de prueba:** siempre ficticios, con `generarRutFicticio()` de `shared/`.
