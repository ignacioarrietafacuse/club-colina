# Suscripción del club con Flow

**Fecha:** 2026-11-13. Módulo "Suscripción" del panel: el club paga a DYNAMIX AI SpA su suscripción
mensual a la plataforma con Flow (flow.cl), con cargo automático a una tarjeta inscrita.

No tiene relación con Forpay ni con los Flows de WhatsApp. El módulo se llama `suscripcion` y el
cliente de la API, `flow-pagos` (`backend/src/services/suscripcion/flow-pagos.ts`).

## Decisiones

Decisiones de Ignacio (2026-11-13). Son fijas: cambiarlas es otro PR.

- **Plan en Flow:** la constante `suscripcion_clubcolina` (`PLAN_SUSCRIPCION` en `shared/`), que
  existe con ese ID en sandbox y en producción. $200.000 mensual, IVA incluido. El monto lo define el
  plan en Flow; el panel lo muestra leyéndolo de Flow (`plans/get`), nunca escrito en el código.
- **Primer cobro el día en que se inscribe la tarjeta:** `subscription/create` con
  `subscription_start` = hoy (America/Santiago) y `trial_period_days = 0`.
- **Flow es la fuente de verdad.** En Postgres hay solo una tabla de una fila,
  `suscripcion_servicio` (modo, `flow_customer_id`, `flow_subscription_id`, email, fechas). La
  migración `0005` solo crea esa tabla.
- **El pago nunca bloquea el panel ni la verificación de QR (`/c/:token`).** Si Flow falla, la
  página dice "no disponible" y el aviso global queda apagado.
- **Dominio del panel:** `PUBLIC_BASE_URL` (hoy `https://panel.clubcolina.com`). No se escribe en el
  código. El retorno de Flow es `PUBLIC_BASE_URL + /api/suscripcion/retorno`.

### Variables

Creadas en Railway, servicio `club-colina`. Los agentes no las tocan: el paso a `produccion` lo hace
Ignacio.

| Variable | Valor |
|---|---|
| `FLOW_MODO` | `sandbox` o `produccion` |
| `FLOW_SANDBOX_API_KEY`, `FLOW_SANDBOX_SECRET_KEY` | Claves de sandbox.flow.cl |
| `FLOW_PROD_API_KEY`, `FLOW_PROD_SECRET_KEY` | Claves de www.flow.cl |

- Un solo módulo de configuración (`configFlow()` en `flow-pagos.ts`) resuelve, en cada solicitud a
  Flow, el par de claves y la URL según `FLOW_MODO`: `sandbox` → `https://sandbox.flow.cl/api` con
  las claves SANDBOX; `produccion` → `https://www.flow.cl/api` con las claves PROD. Las URL son
  constantes en el código.
- `FLOW_MODO` vacío, con otro valor o con claves faltantes para ese modo: el módulo muestra
  "Pendiente de configuración" y el resto del sistema sigue igual. **Nunca cae a producción por
  defecto.** Un valor malo tampoco impide que arranque el servidor.
- Si `FLOW_MODO` no coincide con el modo guardado en `suscripcion_servicio`, el backend ignora ese
  registro y la página queda "sin tarjeta" para ese modo (los ids de sandbox no existen en
  producción). Al inscribir una tarjeta en producción, la fila de sandbox se reemplaza. Desde
  sandbox nunca se reemplaza una fila de producción (409): así una prueba no borra los ids de la
  suscripción real, que seguiría cobrando sin que el panel la viera.
- Las claves nunca van en el repo, los logs, los PRs ni las respuestas. Los logs registran el modo,
  el servicio y el estado HTTP de cada llamada a Flow; nunca claves, firma ni parámetros.
- **Firma** (verificada contra developers.flow.cl/api, "¿Cómo firmar con su SecretKey?"):
  HMAC-SHA256 con la secret key del modo activo, sobre todos los parámetros menos `s`, ordenados
  alfabéticamente por nombre y concatenados como nombre+valor, en hexadecimal. Va en el parámetro
  `s`: en la consulta si es GET, en el cuerpo `application/x-www-form-urlencoded` si es POST.

## Rutas

Todas con sesión del panel y la clave al día, salvo el retorno.

| Ruta | Qué hace |
|---|---|
| `GET /api/suscripcion` | Estado combinado leyendo Flow en el momento (`plans/get`, `customer/get`, `subscription/get`; el historial sale de los importes de la suscripción). Estados: `sin_tarjeta`, `activa`, `cobro_fallido`, `no_disponible`, `pendiente_configuracion`. Si Flow falla o tarda más de 8 s en total: `no_disponible` |
| `POST /api/suscripcion/inscribir-tarjeta` `{email}` | Sin cliente para el modo activo: `customer/create` (name "Club Colina", externalId "club-colina", email) y se guarda con el modo. Si Flow ya tiene ese cliente, lo recupera (ver abajo). Luego `customer/register` con el retorno. Devuelve `{resultado: "flow", url}` con `url + "?token=" + token`, o `{resultado: "recuperada"}` si el cliente recuperado ya tenía la suscripción vigente. Con cliente, el correo no se pide: es "Cambiar tarjeta" |
| `GET` y `POST /api/suscripcion/retorno` | Pública: Flow vuelve desde su sitio con un POST de formulario y la cookie de sesión no viaja. Solo acepta el token de la última inscripción pedida desde el panel (se guarda su hash), dentro de 2 horas y una sola vez; cualquier otro termina en `error` sin llamar a Flow, y uno ya usado responde `ok` sin tocar Flow. Así un token viejo nunca vuelve a crear una suscripción cancelada. Luego llama `customer/getRegisterStatus` y sigue solo si el `customerId` es el guardado para el modo activo y el registro fue exitoso. Si no hay suscripción, la busca en Flow (`customer/getSubscriptions`) y solo si no existe la crea. Termina siempre en 303 a `/suscripcion?resultado=ok\|error`, sin datos. Es la única ruta que acepta un `Origin` ajeno (`config.origenExterno`) |
| `POST /api/suscripcion/reintentar` | `invoice/retryToCollect` sobre el importe vencido más antiguo (Flow solo reintenta vencidos). 409 si no hay vencidos o si Flow rechaza el reintento; 503 solo si Flow no responde. 3 intentos cada 15 minutos por usuario |
| `GET /api/suscripcion/aviso` | Solo `{cobro_fallido}`, con caché en memoria de 15 minutos. Se invalida al inscribir, al volver de Flow y al reintentar; `GET /api/suscripcion` la deja al día |

"Reintentar cobro" aparece solo con un cobro fallido y un importe vencido (`puede_reintentar`); con
un cobro fallido que aún no vence, la página ofrece solo "Cambiar tarjeta".

"Cobro fallido": la suscripción está morosa en Flow (`morose = 1`) o tiene un importe impago
(`status 0`) cuyo cobro Flow ya intentó (`error = 1` o `attemp_count > 0`), aunque Flow ya no
informe la tarjeta. **No se mira `due_date`:** Flow lo pone días después de emitir el importe ("Fecha
en que este importe será considerado moroso"; en sandbox, 3 días) aunque el cobro salga el mismo
día. `due_date` solo decide "Reintentar cobro", porque Flow reintenta solo importes vencidos. Un
importe que vence sin que Flow alcance a intentar el cobro lo informa la suscripción: según la
documentación de Flow, `morose` es "1 si uno o más invoices están vencidos".

### Cliente ya creado en Flow

El externalId "club-colina" es fijo y Flow no acepta dos clientes con el mismo (verificado en
sandbox el 2026-11-14: el segundo `customer/create` responde 401 con código 501). Si se pierde la
fila de `suscripcion_servicio`, inscribir lo recupera en vez de crear otro:

1. Solo si `customer/create` responde 401 con código 501 (cualquier otro error se mantiene tal cual),
   se busca al cliente con `customer/list`. Flow no documenta un servicio por externalId:
   `customer/list` filtra solo por nombre ("Filtro por nombre del cliente"), así que se filtra por
   "Club Colina", se recorren hasta 5 páginas de 100 (cortando con `hasMore`) y se compara el
   externalId exacto. Solo sirve un único cliente activo (status 1). El log anota cuántos calzan y
   cuántos están activos, sin ids ni datos.
2. Con el cliente recuperado se guarda su `customerId` con el modo activo y se revisa
   `customer/getSubscriptions` (todas sus páginas, hasta 5 de 100; si hubiera más, Flow cuenta como
   no disponible). Si tiene la suscripción vigente del plan, se guarda y la página queda Activa sin
   pasar por Flow ni cobrar. Si no, sigue a inscribir la tarjeta. El correo que escribió Mony se
   guarda solo como referencia: Flow sigue con el del cliente recuperado.
3. Si no se encuentra (o hay más de uno, o Flow falla), se mantiene el error: "El servicio de pagos
   no está disponible". Nunca se usa otro externalId para esquivar el rechazo.

Un cliente renombrado en Flow ya no aparece con ese filtro: queda el error y hay que corregir el
nombre en Flow.

Si hay cliente pero no quedó guardado el id de la suscripción, o la guardada está cancelada (Flow
creó una nueva y su respuesta se perdió), `GET /api/suscripcion` busca la vigente en Flow (`customer/getSubscriptions`) y la guarda, y el token
pendiente deja de servir: un cobro ya hecho nunca se ve como "sin tarjeta".

Inscribir y el retorno toman un candado de Postgres (`CANDADO_SUSCRIPCION`), con a lo más 5 s de
espera al inscribir y 25 s en el retorno (más que el plazo de Flow de otro retorno: si Mony recarga
mientras Flow crea la suscripción, el segundo retorno espera al primero y responde "ok"): dos clics seguidos no crean dos clientes, y dos retornos a la vez no crean dos suscripciones.
El retorno compara el token antes de pedir el candado, así un token inventado no ocupa una conexión
esperando. Al inscribir, el cliente nuevo de Flow se guarda antes de pedir el registro de tarjeta: si
el registro falla, el siguiente intento no crea otro cliente. La URL que devuelve Flow tiene que ser
https en `flow.cl` o un subdominio suyo; si no, no se entrega. El hash del token se guarda con el
candado y solo si el cliente sigue siendo el mismo (si no, 409).

El retorno acepta también `GET` (lo pidió Ignacio), aunque Flow vuelve por `POST`. Riesgo aceptado:
el token de un `GET` queda en los logs de borde de Vercel y Railway, pero sirve una sola vez, dura
2 horas y solo para el cliente del club.

## Pantalla

Ítem "Suscripción" en el menú, junto a "Cambiar clave". Estados: sin tarjeta (plan, monto, correo
del club e "Inscribir tarjeta"), activa (estado, monto, próximo cobro, tarjeta, "Cambiar tarjeta" e
historial), cobro fallido (aviso arriba con "Cambiar tarjeta" y "Reintentar cobro") y un mensaje
simple para no disponible o pendiente de configuración. En sandbox, la etiqueta "Modo de prueba".
El aviso de `?resultado=ok|error` (o "recuperada") se muestra una sola vez: se quita de la URL al
llegar, y nunca encima de un estado que lo contradiga ("Listo" solo con una suscripción viva; un
error encima de una suscripción viva dice que falló el cambio de tarjeta y que la suscripción
sigue).

`inscribirTarjetaResponse` sin `resultado` cuenta como `flow`: el frontend nuevo entiende al backend
anterior mientras Vercel y Railway publican por separado.
Aviso global en todas las pantallas del panel cuando hay cobro fallido, con enlace a la página; no
bloquea nada. Sin "Cancelar suscripción" ni cambio de plan.

El historial tiene la columna "Período" ("13-11-2026 al 12-12-2026") con `period_start` y
`period_end` del importe, tal cual los devuelve Flow: Flow ya termina el período el día anterior al
cobro siguiente (verificado en sandbox), así que no se ajusta nada. Bajo "Próximo cobro", "Período
actual" es el período del último cobro pagado. Sin las dos fechas de Flow, el período queda "—".

## Verificado en sandbox (2026-11-13 y 14)

- **Primer cobro:** Flow emite y cobra el primer importe el mismo día de la inscripción, al crear la
  suscripción (importe del 13-11-2026, pagado). El siguiente es el 13-12-2026.
- **Período del importe:** `period_start` 2026-11-13 y `period_end` 2026-12-12: Flow ya termina el
  período el día anterior al cobro siguiente.
- **externalId repetido:** Flow lo rechaza (401, código 501). Ver "Cliente ya creado en Flow".
- **Página de registro de tarjeta:** `customer/register` devuelve una URL en `sandbox.flow.cl`
  (https), que la validación acepta.
