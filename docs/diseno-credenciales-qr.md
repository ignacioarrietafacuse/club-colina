# Diseño aprobado — Etapa 1: registro y credenciales virtuales con QR

**Estado:** Aprobado por Ignacio (2026-11-11). Es el núcleo de la Etapa 1 (urgente) del PRD v1.1.
**Última actualización:** 2026-11-11 — se agrega la carga inicial desde la base del club y el formulario que reconoce el RUT.
**Origen:** Mony pidió una forma de identificar a jugadores y apoderados cuando entran al Pucalán.
**Efecto adicional:** el sistema parte con la base del club precargada. El formulario de registro completa lo que falta (foto, número de camiseta) y queda como el proceso permanente de ingreso.

## Alcance de la Etapa 1
- Jugadores, apoderados y entrenadores.
- Carga inicial de la base del club (una sola vez).
- Link de registro y generación de los QR.
- Panel con datos reales de lo anterior. **Se eliminan todos los datos mock.**
- Todo el resto (categorías completas, torneos y campus, uniformes, WhatsApp/Kapso, IA, leads, pagos) va en la Etapa 2, cuando Mony entregue la información. En el panel aparece como **"Pendiente"**.

## Problema
El club necesita verificar en la entrada del Pucalán que quien entra es jugador, apoderado o entrenador del club.

## Solución (cómo la ve el club)
- **Carga inicial:** la base que entregó Mony (inscripciones 2026) se importa al sistema. Cada persona queda **precargada**: existe en el panel, pero sin credencial.
- Mony comparte el link de registro por los grupos de WhatsApp del club.
- La persona escribe su RUT. **Si el sistema lo reconoce, le pide lo que falta y la foto**; al apoderado titular, además, el teléfono que dio al club, para detectar suplantaciones. El jugador adulto llena su formulario completo, y lo que el club ya tiene no se cambia. Si no lo reconoce, llena el formulario completo.
- **Jugadores nuevos:** cada vez que entra un jugador, Mony le manda el mismo link al apoderado.
- Los jugadores adultos usan el mismo link.
- **Entrenadores:** no llenan nada. Mony los crea a mano en el panel, descarga el QR de cada uno y se lo envía ella misma.
- Lo que falte en una ficha lo puede completar la familia por el formulario o Mony directamente en el panel.
- Mony aprueba cada registro desde el panel y completa lo que le corresponde a ella (becas). Recién ahí el QR empieza a servir.
- En la entrada, quien controla escanea el QR con la cámara de su propio teléfono, sin instalar nada. Ve **solo la foto, el nombre y si es jugador, apoderado o entrenador**. Si el código no es válido o no está aprobado, aparece "Credencial no válida".

## Decisiones
- **Aprobación manual de Mony:** ningún QR funciona hasta que ella aprueba. Puede aprobar a la familia entera o persona por persona.
- **Precargado no es activo:** quien viene de la base no tiene credencial ni cuenta como activo hasta que complete la foto y Mony apruebe.
- **Reconocimiento por RUT:** el formulario parte pidiendo el RUT. Si está en la base, se saltan las preguntas ya respondidas.
- **No se muestran datos guardados:** al reconocer un RUT, el formulario no muestra RUT, teléfonos, correos ni fechas. Solo muestra el primer nombre de cada hijo, para que el apoderado sepa a quién le está subiendo la foto.
- **El hijo no tiene proceso propio:** el apoderado lo inscribe completo (con foto) y recibe su QR. No hay cuentas de jugador.
- **Jugadores adultos:** se registran solos con el mismo formulario. Si la base trae un apoderado para un jugador adulto, se respeta ese vínculo.
- **Entrenadores:** tienen su propia sección en el panel. Mony los crea a mano (datos y foto), quedan activos de inmediato, y ella descarga el QR y se lo envía a cada uno. No usan el link de registro.
- **Foto obligatoria** para cada persona. Sin foto no se activa la credencial.
- **Número de camiseta obligatorio.** Quien aún no tiene número asignado pone **99** (se les indica en el mensaje de WhatsApp y en el propio formulario).
- **Categoría calculada:** se calcula por año de nacimiento en ambas ramas (tabla en `categorias`). El formulario solo pregunta la categoría cuando no se puede calcular: el año no calza con ninguna categoría o la fecha de nacimiento falta o es errónea. Mony la puede corregir al aprobar.
- **No se pide** parentesco ni datos de salud. El correo del apoderado no se pide en el formulario; viene de la base cuando existe.
- **Sí se pide** quién paga la mensualidad (Forpay cobra por apoderado), rama y número de camiseta.
- **Mony completa al aprobar:** becas; también puede corregir categoría, número y método de pago.
- **Becas:** las asigna solo Mony, por jugador, con porcentaje libre y separado para cada concepto:
  - **Mensualidad:** puede tener beca.
  - **Torneos:** puede tener beca.
  - **Campus y clínicas de técnica** (campamento de verano, entrenamiento extra pagado con un entrenador, etc.): puede tener beca.
  - **Uniformes:** nunca tienen beca.
- **Sección "Torneos y campus":** la sección Torneos del panel se llama así y maneja también campus y clínicas (Etapa 2).
- **Sin Kapso en la Etapa 1:** el link se comparte a mano. Kapso y toda la integración de WhatsApp van en la Etapa 2.
- **Sin datos mock:** el panel solo muestra información real; lo no construido dice "Pendiente".

## Carga inicial desde la base del club
La base es la exportación del formulario de inscripción 2026: 177 jugadores de básquet y 50 de vóley, con 208 apoderados distintos. La versión limpia y estandarizada es `Base_datos_club_colina_limpia.xlsx`.

### Qué se importa
| Destino | Campos |
|---|---|
| Jugador | nombre, apellido, RUT, fecha de nacimiento, rama, categoría (básquet: la de la base; vóley: calculada por año), si postula a beca |
| Apoderado | nombre, RUT, teléfono, correo, método de pago |
| Vínculo | jugador con su apoderado, marcado como quien paga la mensualidad |

- El nombre del apoderado viene en una sola celda. Se separa en nombre y apellido por el primer espacio; Mony lo corrige si queda mal.
- En jugadores adultos sin apoderado, el teléfono, el correo y el método de pago van en la ficha del jugador.

### Qué no se importa
- Condición de salud, colegio y clínica. Son datos sensibles o que el sistema no usa (Ley 21.719).
- Estado de fichaje. No está en el alcance del PRD.
- Segundo teléfono del apoderado.

### Qué no trae la base
- Foto y número de camiseta: los completa la familia por el formulario o Mony en el panel.
- Categoría de vóley: se calculó por año de nacimiento. Dos jugadoras quedan sin categoría (una nacida en 2017, que correspondería a U10, y una con fecha errónea): el formulario se la pregunta.

**Vigencia:** Mony confirmó que la base está al día, aunque se le puede haber pasado alguien. Por eso se mantienen la casilla "Ya no está en el club" del formulario y la lista de precargados sin registrarse en el panel.

### Reglas de la importación
- Se hace una sola vez, con un script del backend. Se puede volver a correr sin duplicar (la llave es el RUT).
- El archivo no entra al repositorio.
- **Datos incoherentes: no se cargan.** No se le pide a Mony corregir la planilla. El dato dudoso queda vacío en la ficha y el formulario se lo pregunta a la familia cuando vaya a sacar su QR (son los 33 puntos de la hoja "Por revisar").
  - Teléfono incompleto, correo mal escrito, fecha de nacimiento errónea, nombre de apoderado faltante o método de pago ambiguo: ese campo queda vacío.
  - Apoderado con RUT no válido, o igual al del hijo menor: no se carga el apoderado. El jugador queda precargado sin apoderado.
  - Jugador con RUT no válido: no se carga el jugador (4 casos). Su familia llena el formulario completo, como un jugador nuevo.
  - Jugador adulto sin datos de contacto: se carga igual; el formulario le pide el teléfono.
- **Hijo precargado sin apoderado:** el apoderado no es reconocido por su RUT y llena sus propios datos. Al escribir el RUT del hijo, el sistema lo reconoce y le pide solo lo que falta.
- Número de camiseta: queda vacío en los precargados (no se inventa un 99).
- Todos quedan en estado **precargado** y con origen "base 2026".

### Estandarización
- **RUT:** se guarda siempre como `12345678-9`, sin puntos, con guion y K mayúscula. El formulario y el panel aceptan cualquier forma de escribirlo y lo convierten. Se valida el dígito verificador en el formulario y en el backend.
- **Teléfono:** 9 dígitos, sin +56.
- **Correo:** en minúsculas.
- **Método de pago:** Forpay mensual / Transferencia anual / Tarjeta de crédito anual. Confirmados por Mony (2026-11-11).

## Flujo
1. La persona abre el link y escribe su RUT.
2. **RUT reconocido:** ve las preguntas que faltan y la foto; el apoderado titular escribe además el teléfono que dio al club. **RUT no reconocido:** llena el formulario completo.
3. Al enviar recibe un **link privado** donde ve el estado ("pendiente de aprobación") y, una vez aprobado, los QR de las personas que llegaron en esa solicitud (en el caso del apoderado, los de los hijos que inscribió en ella; un hijo ya inscrito por otro apoderado aparece cuando Mony aprueba el vínculo).
4. Mony revisa la solicitud en el panel, asigna becas si corresponde y aprueba. Las que calzan con la base aparecen marcadas "Coincide con la base".
5. Los QR quedan activos. El apoderado reenvía el QR al hijo si este tiene celular.

**Otros apoderados:** el primero ingresa nombre, apellido, RUT y teléfono del segundo. Queda creado sin foto y su credencial no se activa hasta que suba la suya desde un link personal que el primero le reenvía.

**Mismo hijo inscrito por dos apoderados:** el RUT del jugador es único. Al segundo se le avisa que el jugador ya está inscrito y que quedará vinculado como apoderado (sin mostrarle datos). Mony aprueba el vínculo.

**Suplantación:** alguien que conozca el RUT de un apoderado podría enviar fotos en su nombre. No ve ningún dato, y la credencial no se activa sin que Mony revise la foto y apruebe. La consulta de RUT tiene un límite de intentos y nunca devuelve ids: los hijos precargados se identifican por su posición en la lista, que el servidor recalcula a partir del RUT al recibir la solicitud. El link privado (`/familia`) muestra solo a las personas que llegaron en esa solicitud, nunca al resto de la familia de la base. El panel marca con un aviso las solicitudes sospechosas: un RUT que ya se había registrado, un teléfono distinto al de la base (o un precargado sin teléfono con qué comparar), un hijo que ya tiene otro apoderado, un apoderado nuevo para un hijo ya registrado, un otro apoderado que ya existía, un hijo marcado como "ya no está", una solicitud pendiente a la que después le llegó otra sobre las mismas personas, un hijo precargado sin apoderado que se completó al nombrarlo por RUT, o una solicitud cuyos cambios no se aplicaron porque otra pendiente ya había modificado a esa persona (decisiones de Ignacio, 2026-11-12). Un hijo de otra familia nombrado por RUT no aparece en el link privado hasta que Mony aprueba el vínculo. Si quien llena usa el RUT de un apoderado ya registrado, su link privado muestra solo a las personas que esa solicitud creó o completó (sus hijos nuevos, o un precargado de su propia lista): nunca a alguien que ya existía y se nombró por RUT, ni a un hijo que ya estaba activo, aunque Mony apruebe el vínculo. Esa persona tiene su QR en su link original, que Mony puede reenviar desde el panel (decisión de Ignacio, 2026-11-12). Una solicitud que solo marca hijos "ya no está" queda revisada al crearse y no pasa por la cola de pendientes: la marca es solo una señal (ver "Si el RUT está en la base"), así que una marca falsa no saca a nadie del link privado ni le quita su credencial.

## Formulario
**Paso 1 — RUT:** la persona escribe su RUT. El sistema valida el dígito verificador y busca si está precargada.

### Si el RUT está en la base
Solo se pregunta lo que no esté en la ficha, salvo el teléfono del apoderado titular. Lo habitual:

**Apoderado**
- Su foto.
- Casilla "soy quien paga la mensualidad".
- Nombre o apellido, solo si faltan.
- Teléfono (el que dio al club al inscribirse), siempre: si la base no lo tiene se completa; si lo tiene, no se cambia y, si no coincide, la solicitud llega con el aviso de teléfono distinto. Así se detecta a quien conoce el RUT de un apoderado e intenta registrarse en su nombre (decisión de Ignacio, 2026-11-12).

**Por cada hijo precargado** (identificado por su primer nombre)
- Foto.
- Número de camiseta (texto de ayuda: "Si aún no tiene número asignado, escribe 99").
- Casilla "Ya no está en el club": es **solo una señal para Mony** (decisión de Ignacio, 2026-11-12). No saca al hijo del link privado, no desactiva su credencial y no cambia su estado; tampoco impide aprobarlo ni activarlo, y no se deshace al rechazar otra solicitud. Se aplica siempre, aunque otra solicitud haya modificado a ese hijo. Mony la ve en el dashboard (cuántos marcados quedan sin resolver, con enlace a la lista filtrada) y en la ficha; confirma con la familia y lo da de baja en la ficha (eso sí lo saca del link privado) o quita la marca. Una solicitud que solo marca hijos queda revisada al crearse. Así, aunque la marque un impostor, no le hace daño a nadie.

**Jugador adulto**
- El formulario completo, igual que si no estuviera en la base: el servidor exige todos los datos para que la respuesta no revele si el RUT está. Lo que el club ya tiene no se cambia; solo se completa lo que falta.

Después puede agregar a un hijo que no esté en la base (formulario completo de hijo) y a otro apoderado.

### Si el RUT no está en la base
**Quién eres:** apoderado o jugador mayor de edad.

**Tus datos:** nombre, apellido, teléfono, foto.
- Apoderado: además, casilla "soy quien paga la mensualidad".
- Jugador adulto: además, fecha de nacimiento, rama y número de camiseta.

**Tus hijos** (solo apoderados; uno o más): primero el RUT del hijo. Si está precargado, se pide solo lo que falta y la foto. Si no, nombre, apellido, fecha de nacimiento, rama (Basketball / Voleibol), número de camiseta y foto.

### En ambos casos
**Otro apoderado** (solo apoderados; opcional): nombre, apellido, RUT, teléfono, y a cuáles de los hijos corresponde.

**Consentimiento:** casilla de uso de datos y fotos para identificación en el club. Enviar.

## Modelo de datos
Tablas definitivas del sistema (no temporales). Postgres en Railway.

### `apoderados`
| Campo | Nota |
|---|---|
| id, nombre, apellido | |
| rut | único; formato `12345678-9` |
| telefono | 9 dígitos; sirve después para identificarlo en WhatsApp |
| email | nulo; viene de la base, no se pide en el formulario |
| metodo_pago | nulo; viene de la base o lo completa Mony |
| foto_id | referencia a la tabla `fotos`; nulo hasta que la suba |
| credencial_token | aleatorio, único; es lo que va en el QR |
| estado | precargado / pendiente / activo / rechazado / inactivo |
| origen | base_2026 / formulario |
| solicitud_id | con qué registro llegó; nulo mientras esté precargado |

### `jugadores`
| Campo | Nota |
|---|---|
| id, nombre, apellido | |
| rut | único; formato `12345678-9`; evita duplicados |
| fecha_nacimiento | la edad se calcula, no se guarda |
| disciplina | basketball / voleibol |
| categoria_id | se calcula por año de nacimiento; nulo si no se puede calcular (el formulario la pregunta). Mony puede corregirla |
| numero_camiseta | nulo solo en precargados; obligatorio para aprobar. **99 = sin número asignado** |
| postula_beca | verdadero si lo marcó en la inscripción; orienta a Mony al aprobar |
| beca_mensualidad_pct | entero 0–100, por defecto 0. Lo define solo Mony |
| beca_torneos_pct | entero 0–100, por defecto 0. Lo define solo Mony |
| beca_campus_pct | entero 0–100, por defecto 0. Aplica a campus y clínicas de técnica |
| telefono | obligatorio solo para el jugador adulto |
| email | nulo; no se pide |
| metodo_pago | solo para el jugador adulto sin apoderado |
| foto_id, credencial_token, estado, origen, solicitud_id | igual que en apoderados |

**Estados:** precargado (viene de la base, sin completar) → pendiente (envió el formulario) → activo (Mony aprobó). Rechazado e inactivo como antes.

**Por qué la beca va en el jugador y no en el apoderado:** un apoderado puede tener un hijo becado y otro no, o con porcentajes distintos. Como el cobro de la mensualidad es una sola suscripción por apoderado, su monto se calcula sumando la mensualidad de cada hijo con su descuento.

**Por qué tres porcentajes y no uno:** un jugador puede estar becado en la mensualidad y no en torneos, o al revés. Tres columnas es lo más simple; no hace falta una tabla de becas. No existe columna para uniformes porque nunca se becan.

**Alcance por ahora:** los porcentajes solo se guardan. El cálculo del monto a cobrar se implementa en la Etapa 2.

### `entrenadores`
| Campo | Nota |
|---|---|
| id, nombre, apellido | |
| rut | único |
| telefono | |
| disciplina | basketball / voleibol |
| foto_id | la sube Mony al crearlo |
| credencial_token | igual que en apoderados |
| estado | activo / inactivo (no pasa por aprobación) |

No tiene `solicitud_id`: lo crea Mony directamente en el panel.

En la Etapa 2, las categorías y los torneos apuntan a esta tabla para su entrenador responsable.

### `jugador_apoderado` (muchos a muchos)
| Campo | Nota |
|---|---|
| jugador_id, apoderado_id | |
| paga_mensualidad | verdadero si ese apoderado paga por ese jugador |
| estado | pendiente / activo, para aprobar vínculos nuevos |
| solicitud_id | la solicitud que creó el vínculo; nulo si viene de la base o del panel |

### `categorias`
| Campo | Nota |
|---|---|
| id, nombre, disciplina | |
| anio_desde, anio_hasta | años de nacimiento que cubre; con esto se calcula la categoría |

| Rama | Categoría | Años de nacimiento |
|---|---|---|
| Básquet | U9 | 2017–2018 |
| Básquet | U11 | 2015–2016 |
| Básquet | U11 F | 2015–2016 (femenina; la asigna Mony) |
| Básquet | U13 | 2013–2014 |
| Básquet | U15 | 2011–2012 |
| Básquet | U17 | 2009–2010 |
| Básquet | U21 | 2005–2008 |
| Vóley | U12 | 2015–2016 |
| Vóley | U14 | 2013–2014 |
| Vóley | U16 | 2011–2012 |
| Vóley | U18 | 2009–2010 |

- Básquet: sacado de la base. U11 F es la única categoría femenina (confirmado por Mony) y no se calcula sola.
- Vóley: no tiene U10 (Mony, 2026-11-11). Los años se establecieron por decisión de Ignacio (2026-11-11), sin confirmación de Mony; si ella los corrige, se ajusta esta tabla y se recalcula.
- Año fuera de la tabla (por ejemplo, vóley 2017): sin categoría; el formulario la pregunta.

Horarios, lugar y entrenador se agregan en la Etapa 2.

### `solicitudes_registro`
| Campo | Nota |
|---|---|
| id, creada_en | |
| token_acceso_hash | sha256 del link privado de quien se registró (distinto del token del QR); la base nunca guarda el link |
| avisos | casos que Mony debe mirar antes de aprobar (ver Suplantación) |
| consentimiento_en | fecha y hora en que aceptó el uso de datos y fotos |
| estado, revisada_en | |
| tipo | formulario / segundo_apoderado (el link personal de `/completar`) |
| solicitud_origen_id | solo en la de segundo apoderado: la solicitud que lo agregó |
| coincide_base | si el RUT estaba precargado |

**Dos tokens distintos:** `credencial_token` va en el QR y es público (solo muestra foto, nombre y rol). `token_acceso` es el link privado (muestra los QR de las personas de esa solicitud). La base guarda solo su hash, igual que el del link personal de un segundo apoderado (`/completar`). Si se pierde, Mony genera uno nuevo desde el panel y el anterior deja de funcionar (decisión de Ignacio, 2026-11-12). `credencial_token` queda en claro porque hay que dibujar el QR.

## Diseño técnico
- **Verificación:** página pública `panel.clubcolina.cl/c/{token}`. Muestra foto + nombre + rol (Jugador / Apoderado / Entrenador) solo si la persona está en estado activo.
- **No se muestra al escanear:** categoría, número, becas, estado de pago, RUT, teléfono ni familiares.
- **Consulta de RUT del formulario:** responde solo si está o no en la base y qué campos faltan (más el primer nombre de los hijos). Nunca devuelve los datos guardados. Con límite de intentos. El RUT de un jugador que no es adulto con certeza (menor, o sin fecha en la base) responde como si no estuviera, y la lista de hijos oculta los vínculos pendientes hacia hijos de otra familia nombrados por RUT hasta que Mony los aprueba (decisión de Ignacio, 2026-11-12).
- **Panel de Mony:**
  - Login.
  - Solicitudes pendientes con foto y datos: aprobar / rechazar, asignar becas por jugador (mensualidad, torneos, campus/clínicas) y corregir categoría y número. Etiqueta "Coincide con la base" en las que vienen de un RUT precargado. Al rechazar, un precargado vuelve a como estaba; una persona nueva (llegó por el formulario y nunca estuvo activa) se borra con su foto y sus vínculos, para liberar su RUT y no guardar datos de menores sin motivo (Ley 21.719; decisión de Ignacio, 2026-11-12). Una solicitud pendiente que ya no deja nada por decidir (lo que traía se decidió desde otra, o sus cambios los bloqueó otra pendiente) se cierra con "Dar por revisada", que borra las copias que guardaba para restaurar.
  - Secciones Jugadores y Apoderados con datos reales. Filtros por estado (incluye "Precargado") y por "Faltan datos".
  - Ficha editable: Mony puede completar cualquier dato que falte, incluida la foto, sin esperar a la familia.
  - Lista de precargados que aún no se registran, para insistir por los grupos y detectar retirados. Mony puede marcarlos inactivos.
  - Las becas se pueden cambiar después desde la ficha del jugador.
  - Sección Entrenadores: botón para crear un entrenador (nombre, apellido, RUT, teléfono, rama, foto) y botón para descargar su QR como imagen.
  - Dashboard: jugadores activos, apoderados, entrenadores, solicitudes pendientes, marcados "ya no está" sin resolver y precargados sin registrarse, con números reales; el resto de las tarjetas con la etiqueta "Pendiente".
  - Secciones de la Etapa 2 (Categorías, Torneos y campus, Uniformes, IA y Conversaciones, Leads, Pagos): visibles en el menú, con estado "Pendiente — disponible en la próxima etapa".
- **Datos mock:** se eliminan todos del frontend.
- **Becas:** visibles solo en el panel. No aparecen en el link privado ni en la credencial.
- **Número 99:** el sistema lo trata como "sin número asignado": el panel lo muestra así, permite filtrar a esos jugadores y queda excluido de la validación de números repetidos. Mony lo reemplaza cuando se asigna el número real.
- **Validación de números repetidos** (mismo año de nacimiento ± 1): queda para la Etapa 2 (uniformes). Por ahora el número solo se registra.
- **Revocación:** al dar de baja a alguien se invalida su token. Se puede regenerar si se filtra un QR.
- **Fotos:** en Postgres, en la tabla `fotos` (id, mime, bytes, creado_en); las fichas apuntan con `foto_id`. Se guardan sin metadatos (EXIF, GPS, XMP, comentarios): el backend los borra antes de guardar. Nunca en una URL pública fija; se sirven solo a través de la página de verificación y del panel, con `Cache-Control: private, no-store`. Entran en los respaldos de la base (decisión de Ignacio, 2026-11-11).
- **Costo/servicios externos:** ninguno nuevo.

## Torneos y campus (Etapa 2)
Los campus y clínicas de técnica son actividades pagadas aparte de la mensualidad: campamento de verano, clínicas de técnica, entrenamientos extra con un entrenador.

- **Sin sección nueva:** se manejan en la misma sección que los torneos, llamada **"Torneos y campus"**.
- **Misma tabla:** `torneos` con un campo `tipo` (torneo / campus / clínica). El resto de la estructura es compartida: nombre, fechas, precio, participantes y pago.
- **Beca según tipo:** tipo torneo aplica `beca_torneos_pct`; tipo campus o clínica aplica `beca_campus_pct`.
- En la Etapa 1 solo se guarda el porcentaje de beca.

## Pendiente del club
- **Para la Etapa 1 (no bloquea):** que Mony confirme los años de cada categoría de vóley.
- **Respondido por Mony (2026-11-11):** la base está al día (puede faltar alguien), U11 F es la única categoría femenina y los tres métodos de pago están confirmados.
- **Para la Etapa 2:** el resto de la información y documentos listados en el PRD (sección 38).

## Fuera de alcance
- Apple Wallet / Google Wallet.
- App propia de escaneo.
- Registro de entradas y salidas.
- Bloqueo de acceso por morosidad o mostrar estado de pago.
- QR rotativos o con expiración.
- Envío automático por WhatsApp (Kapso): Etapa 2.
- Cálculo de montos con beca: Etapa 2.
- Gestión de torneos, campus y clínicas: Etapa 2.
- Estado de fichaje de los jugadores.
- Datos de salud, colegio y clínica.

## Notas
- Fotos y datos de menores: los entrega el apoderado, con consentimiento registrado, y se muestra lo mínimo (Ley 21.719).
- Los datos precargados vienen de la inscripción 2026 que cada familia llenó para el club. El consentimiento para fotos y credencial se registra cuando la familia completa el formulario.
