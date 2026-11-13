# Club Colina — PRD y Arquitectura Técnica v1.1

Sistema a medida para Club Basketball Colina y Club Voleibol Colina.

**Objetivo:** construir la solución más simple, confiable y de bajo costo que resuelva los problemas reales del club.

**Versión:** 1.1 (2026-11-11). Reemplaza al PDF v1.0. Las secciones que cambiaron llevan la marca **[v1.1]**.

## Cambios respecto a v1.0

| Tema | v1.0 | v1.1 |
|---|---|---|
| Plan de desarrollo | 9 fases seguidas | Dos etapas: Etapa 1 urgente (jugadores, apoderados, entrenadores y credenciales QR) y Etapa 2 con todo el resto, cuando el club entregue la información |
| Datos de ejemplo (mock) | Se reemplazan gradualmente | Se eliminan todos en la Etapa 1. Lo que no está construido se muestra como "Pendiente" |
| Entrenadores | Sin sección; datos dentro de cada categoría | Sección simple de Entrenadores, con credencial QR |
| Base de datos, auth y archivos | Supabase | Postgres + backend propio en Railway. Supabase descartado (2026-11-10) |
| Frontend | Lovable | Lovable solo para la auditoría inicial; después se desconecta. Alojado en Vercel |
| Repositorio | Monorepo "preferible" | Monorepo decidido (2026-10-12) |
| WhatsApp | Por definir (preferencia Cloud API directa) | Kapso, plan Free, por coexistencia. Un solo número "Club Colina". Se implementa en la Etapa 2 |
| Formularios | No definidos | WhatsApp Flows vía Kapso (Etapa 2) |
| Pasarela de pagos | Por definir | Forpay, modo HYBRID. Cobro por apoderado |
| Becas | Por definir | Porcentaje por jugador y por concepto (mensualidad, torneos, campus). Uniformes sin beca |
| Uniformes | Sincronizar fuente externa del proveedor | Pedido por WhatsApp Flow, consolidado cada 15 días por email al proveedor |
| Torneos | Sección "Torneos" | Sección "Torneos y campus" (incluye campus y clínicas de técnica) |
| Pruebas masivas | Mencionadas | El club no hace pruebas masivas: se cita al próximo entrenamiento |
| Registro y credenciales QR | No existía | Nueva funcionalidad, núcleo de la Etapa 1 (sección 9A) |
| Dominio | No definido | clubcolina.com; panel en panel.clubcolina.com |

## Resumen ejecutivo [v1.1]

| | |
|---|---|
| Principio rector | Sistema a medida, simple de mantener, con costos bajos y sin sobreingeniería |
| Frontend | Aplicación web en el monorepo, alojada en Vercel |
| Datos | PostgreSQL en Railway |
| Backend | Node.js + TypeScript + Fastify en Railway (incluye auth y archivos) |
| Automatizaciones | n8n solo cuando simplifique integraciones externas |
| Integraciones clave | WhatsApp (Kapso), pagos (Forpay) y proveedor de uniformes (email). Todas en la Etapa 2 |
| Etapa 1 (urgente) | Jugadores, apoderados, entrenadores, registro por link y credenciales QR |

## 1. Propósito del documento

Este documento define el alcance funcional, la arquitectura tecnológica, los principios de diseño y el plan de desarrollo del sistema a medida para Club Basketball Colina y Club Voleibol Colina.

No estamos construyendo una startup, una plataforma SaaS genérica ni un producto pensado inicialmente para cientos de clientes.

Estamos construyendo un sistema funcional, simple, estable y de bajo costo operativo, hecho específicamente para Club Colina.

La prioridad es resolver problemas reales del club con la menor complejidad tecnológica posible.

## 2. Objetivo general [v1.1]

Centralizar en una sola plataforma la información y los procesos administrativos más importantes de Club Basketball Colina y Club Voleibol Colina, reduciendo tareas repetitivas y mejorando la atención a apoderados, jugadores y personas interesadas en ingresar al club.

La solución debe permitir:
- Centralizar jugadores, apoderados y entrenadores.
- Registrar familias y jugadores nuevos mediante un formulario, con aprobación del club.
- Identificar a jugadores, apoderados y entrenadores con una credencial virtual (QR).
- Gestionar categorías.
- Gestionar torneos, viajes, campus y clínicas de técnica.
- Consultar y visualizar pagos.
- Consultar y visualizar pedidos de uniformes.
- Registrar y gestionar leads.
- Centralizar conversaciones.
- Automatizar respuestas mediante IA.
- Analizar conversaciones.
- Mostrar información ejecutiva en un Dashboard.
- Reducir consultas manuales repetitivas.

## 3. Principios fundamentales

Toda decisión de arquitectura y producto debe priorizar:
1. Simplicidad.
2. Bajo costo mensual.
3. Bajo mantenimiento.
4. Pocos servicios externos.
5. Pocos puntos de falla.
6. Código comprensible.
7. Automatizaciones confiables.
8. Evitar sobreingeniería.
9. Resolver problemas reales antes que agregar funcionalidades.
10. Mantener el sistema suficientemente flexible para cambios normales del club, pero no diseñarlo como SaaS genérico.

Antes de agregar cualquier funcionalidad debe preguntarse: ¿esto realmente le ahorra tiempo al club o mejora un proceso importante? Si la respuesta es no, no debe implementarse.

## 4. Organización del sistema

Existe una sola organización: Club Colina.

Dentro del sistema existen dos disciplinas: Basketball y Voleibol. Ambas se administran desde la misma plataforma.

- No crear arquitectura multitenant en esta primera versión.
- No crear separación compleja por organizaciones.
- No construir infraestructura pensando anticipadamente en otros clubes.

## 5. Usuarios internos [v1.1]

El sistema tendrá inicialmente uno o dos usuarios administrativos. Ambos pueden tener el mismo nivel de acceso.

No es necesario implementar inicialmente:
- Gestión avanzada de roles.
- Panel de usuarios.
- Matrices complejas de permisos.
- Autenticación de dos factores.
- Gestión de organizaciones.
- Invitaciones de usuarios.
- Self-service onboarding.

Los usuarios se crean manualmente en la base de datos (ya no en Supabase).

La interfaz debe utilizar mensajes genéricos: Buenos días; Buenas tardes; Bienvenido nuevamente; Este es el estado general del club. No personalizar el sistema exclusivamente para una persona.

El panel administrativo vive en **panel.clubcolina.com**.

## 6. Navegación principal [v1.1]

La plataforma tendrá únicamente las siguientes secciones:

| # | Sección | Etapa |
|---|---|---|
| 1 | Dashboard | 1 (con lo disponible; el resto "Pendiente") |
| 2 | Jugadores | 1 |
| 3 | Apoderados | 1 |
| 4 | Entrenadores | 1 |
| 5 | Categorías | 2 |
| 6 | Torneos y campus | 2 |
| 7 | Uniformes | 2 |
| 8 | IA y Conversaciones | 2 |
| 9 | Leads | 2 |
| 10 | Pagos | 2 |

No agregar módulos adicionales sin una necesidad confirmada.

Las solicitudes de registro pendientes de aprobación (sección 9A) se muestran dentro de Jugadores, no como sección nueva.

**Secciones de la Etapa 2 durante la Etapa 1:** aparecen en el menú, pero al entrar muestran un estado "Pendiente — disponible en la próxima etapa". No contienen datos de ejemplo.

**Sin datos mock:** se eliminan todos los datos de ejemplo del frontend. El panel solo muestra información real.

## 7. Dashboard [v1.1]

El Dashboard será la vista principal del sistema. Debe responder rápidamente: ¿qué está ocurriendo actualmente en el club?

**Filtros**
- Rango de fechas.
- Disciplina.
- Categoría.
- Torneo o campus cuando corresponda.

**Indicadores**

| Indicador | Etapa |
|---|---|
| Jugadores activos | 1 |
| Apoderados registrados | 1 |
| Entrenadores | 1 |
| Solicitudes de registro pendientes | 1 |
| Pagos recibidos | 2 |
| Pagos pendientes | 2 |
| Leads nuevos | 2 |
| Conversaciones recibidas | 2 |
| Consultas respondidas mediante IA | 2 |
| Torneos y campus activos | 2 |
| Pedidos de uniformes activos | 2 |
| Actividad reciente | 2 |

Durante la Etapa 1, los indicadores de la Etapa 2 se muestran como tarjetas con la etiqueta **"Pendiente"**, sin números de ejemplo. Así el club ve qué viene sin confundirlo con datos reales.

**Próximas actividades** (Etapa 2)

Widget simple con entrenamientos según horarios fijos, próximos torneos y campus, y actividades relevantes. (El club no hace pruebas masivas; se eliminan del widget.)

No implementar calendario complejo, partidos, fixtures ni resultados deportivos.

**Reporte** (Etapa 2)

Botón Descargar reporte que utilice los filtros activos del Dashboard. No existirá una sección independiente de Reportes.

## 8. Jugadores [v1.1]

Cada jugador tendrá una ficha.

**Información**
- Nombre.
- Apellido.
- RUT (único; evita duplicados).
- Fecha de nacimiento.
- Edad (calculada).
- Disciplina (rama).
- Categoría.
- Número de camiseta (obligatorio para aprobar; vacío solo en los precargados desde la base 2026; 99 = sin número asignado).
- Foto.
- Estado (precargado / pendiente / activo / rechazado / inactivo).
- Apoderados asociados.
- Teléfono cuando corresponda (obligatorio en jugadores adultos).
- Correo cuando corresponda.
- Becas: porcentaje de mensualidad, de torneos y de campus/clínicas (sección 15).
- Método de pago (solo jugadores adultos, que no tienen apoderado).
- Información relevante.
- Historial de pagos (Etapa 2).
- Torneos y campus asociados (Etapa 2).

El club tiene jugadores adultos, que no llevan apoderado.

No registrar asistencia, estadísticas deportivas, resultados, rendimiento ni partidos.

## 9. Apoderados [v1.1]

**Información**
- Nombre.
- Apellido.
- RUT (único).
- Teléfono.
- Correo (opcional; no se pide en el registro).
- Foto.
- Estado (precargado / pendiente / activo / rechazado / inactivo).
- Método de pago (lo completa el club al aprobar).
- Jugadores asociados, indicando por cuáles paga la mensualidad.
- Estado general de pagos (Etapa 2).
- Conversaciones relacionadas (Etapa 2).
- Leads relacionados cuando corresponda (Etapa 2).

Un apoderado puede tener más de un jugador asociado. Un jugador puede tener más de un apoderado.

## 9A. Registro y credenciales QR [nuevo en v1.1 — Etapa 1]

Funcionalidad pedida por el club para identificar a jugadores, apoderados y entrenadores al entrar al Pucalán. Es el núcleo de la Etapa 1. El detalle completo (formulario, modelo de datos, diseño técnico) está en `docs/diseno-credenciales-qr.md`.

**Registro**
- El club comparte un link de registro: por los grupos de WhatsApp para la carga inicial, y a cada apoderado cuando entra un jugador nuevo. El link se comparte a mano; no depende de Kapso.
- El apoderado registra sus datos, inscribe a sus hijos y puede agregar a otros apoderados.
- Los jugadores adultos se registran solos con el mismo formulario.
- Los entrenadores no usan el formulario: el club los crea a mano en el panel (sección 9B).
- Foto obligatoria de cada persona.
- El hijo no tiene un proceso propio: lo inscribe el apoderado.
- Este formulario levanta la base inicial del club y queda como proceso permanente de ingreso.

**Aprobación**
- Ningún registro queda activo hasta que el club lo aprueba en el panel.
- Al aprobar, el club completa las becas y puede corregir categoría, número y método de pago. El método de pago es uno de tres: Forpay mensual, Transferencia anual o Tarjeta de crédito anual (confirmados por el club, 2026-11-11). Viene de la base 2026 cuando existe; si no, lo completa el club.

**Credencial**
- Cada jugador y apoderado aprobado tiene un QR. Los entrenadores lo tienen desde que el club los crea.
- Quien controla la entrada lo escanea con la cámara de su teléfono, sin instalar nada.
- Al escanear se ve solo la foto, el nombre y si es jugador, apoderado o entrenador. Nada más.

**Fuera de alcance:** Apple/Google Wallet, app de escaneo, registro de entradas y salidas, bloqueo por morosidad, QR rotativos.

## 9B. Entrenadores [nuevo en v1.1 — Etapa 1]

Sección simple con la lista de entrenadores del club. Reemplaza la decisión de v1.0 de no tener sección de profesores: se necesita para darles credencial.

**Información**
- Nombre.
- Apellido.
- RUT (único).
- Teléfono.
- Disciplina (rama).
- Foto.
- Estado (activo / inactivo).

**Cómo se crean**
- El club crea a cada entrenador a mano en el panel, con sus datos y su foto. No usan el link de registro.
- Quedan activos al crearlos; no pasan por aprobación.
- El club descarga el QR de cada entrenador desde el panel y se lo envía por su cuenta.

En la Etapa 2, el "profesor responsable" de cada categoría y el "profesor asignado" de cada torneo se eligen desde esta lista.

No construir gestión de horarios, sueldos, asistencia ni evaluación de entrenadores.

## 10. Categorías [v1.1]

Cada categoría representa un grupo deportivo.

Debe contener:
- Nombre.
- Disciplina.
- Cantidad de jugadores.
- Días de entrenamiento.
- Hora de inicio.
- Hora de término.
- Lugar.
- Entrenador responsable (elegido de la sección Entrenadores).

**En la Etapa 1** solo existe la lista mínima (nombre y disciplina) que alimenta el desplegable del formulario de registro. La sección completa, con horarios, lugar y entrenador, es de la Etapa 2.

## 11. Torneos y campus [v1.1 — Etapa 2]

Sección independiente, llamada **"Torneos y campus"**. Incluye campeonatos, viajes y giras deportivas, y también campus y clínicas de técnica (campamento de verano, entrenamientos extra pagados con un entrenador, etc.).

Todas son la misma entidad, con un campo **tipo**: torneo / campus / clínica. No se crea una sección aparte para campus.

**Información general**
- Tipo.
- Nombre.
- Descripción.
- Ciudad.
- País.
- Fecha de inicio.
- Fecha de término.
- Estado.

**Categorías de torneo**

Dentro de cada torneo existe la opción "crear categoría de torneo", con título, entrenador asignado y un buscador para agregar jugadores por nombre.

**Participantes**
- Jugadores.
- Categoría.
- Subcategoría cuando corresponda.
- Entrenador responsable.
- Estado de participación.

**Pagos**
- Valor del torneo, viaje o campus.
- Monto correspondiente a cada jugador, aplicando su beca según el tipo (sección 15).
- Estado.
- Fecha de pago.
- Identificador externo cuando exista.

**Documentación**

Cada torneo o campus puede almacenar archivos propios, como itinerario, autorizaciones, reglamento, información de alojamiento, recomendaciones e información del viaje. No existirá módulo general de Documentos.

## 12. Uniformes [v1.1 — Etapa 2]

Sí existirá una sección visual de Uniformes.

El propósito NO es administrar fabricación. El proveedor externo sigue manejando la producción. La plataforma sirve para tomar los pedidos, consultar su estado y para que la IA pueda responder consultas.

**Flujo del pedido**
- El apoderado hace el pedido por un **WhatsApp Flow** (vía Kapso). La página web de pedidos en clubcolina.com queda descartada.
- El Flow muestra los precios.
- Valida la disponibilidad del número de camiseta comparando jugadores del mismo año de nacimiento, un año hacia atrás y uno hacia adelante. El número 99 ("sin número asignado") queda fuera de esa validación.
- El apoderado sube una foto o captura de la transferencia.
- La plataforma NO gestiona el pago: solo hay un botón manual con el que el club confirma que el pago fue recibido.
- Los pedidos se acumulan por 15 días corridos y luego se envía automáticamente un email al proveedor con el pedido consolidado.
- Los uniformes no tienen beca.

**Información por pedido**
- Jugador.
- Categoría.
- Disciplina.
- Tipo de prenda.
- Talla.
- Número.
- Estado.
- Fecha del pedido.
- Fecha estimada.
- Última actualización.
- Observaciones.
- Comprobante de transferencia.

**Estados sugeridos**
- Pedido recibido.
- En producción.
- Listo para despacho.
- Enviado.
- Disponible para retiro.
- Entregado.

**Pendiente:** cómo se actualizan los estados después de enviar el consolidado al proveedor (manual por el club, o algún aviso del proveedor).

## 13. Pagos [v1.1 — Etapa 2]

La plataforma centralizará información de pagos.

**Información sugerida**
- Jugador.
- Apoderado.
- Concepto.
- Monto.
- Fecha.
- Fecha de vencimiento.
- Estado.
- Categoría.
- Torneo o campus asociado cuando corresponda.
- Identificador externo.

Conceptos posibles: mensualidad, inscripción, torneo, viaje, campus/clínica u otro.

**Modelo de cobro de la mensualidad**

Los cobros están sujetos al apoderado, no al jugador. Cada apoderado tiene UNA sola suscripción recurrente que cubre a todos sus hijos en el club. El sistema modela el pago a nivel de apoderado y registra qué jugadores cubre cada suscripción. El monto se calcula sumando la mensualidad de cada hijo con su beca.

## 14. Pasarela de pagos [v1.1 — Etapa 2]

La pasarela es **Forpay**.

- Modo de integración: **HYBRID** (no WHITE_LABEL), para reducir complejidad del backend. Las comunicaciones al cliente (Magic Link, avisos de pago) quedan a cargo de Forpay.
- Las credenciales de API no son autoservicio: las gestiona la ejecutiva asignada al club (primero ambiente de desarrollo, luego producción).
- La documentación de webhooks ya fue recibida.

**Arquitectura**

Forpay → Webhook → Backend → Postgres

Además, si es posible: consulta periódica → conciliación → Postgres.

Forpay sigue siendo la fuente financiera original. Postgres mantiene el estado necesario para el sistema.

## 15. Becas y descuentos [v1.1]

- Las becas las asigna solo el club, **por jugador**, con un porcentaje libre (0 a 100).
- Hay un porcentaje separado por concepto:
  - **Mensualidad.**
  - **Torneos.**
  - **Campus y clínicas de técnica.**
- **Los uniformes nunca tienen beca.**
- El club las define al aprobar el registro del jugador y puede cambiarlas después en su ficha.
- Las becas se ven solo en el panel: no aparecen en la credencial ni en el link de la familia.
- En la solicitud de ingreso se pregunta si el postulante solicita beca. Si la solicita y cumple las características, el caso se delega completo al club, fuera del flujo automático.

En la Etapa 1 los porcentajes solo se guardan. El cálculo de montos se implementa en la Etapa 2, con pagos y torneos.

Evitar construir un motor de precios complejo: tres porcentajes por jugador, sin tabla de becas.

## 16. Leads [Etapa 2]

Lead representa a una persona interesada en ingresar al club.

**Información sugerida**
- Nombre.
- Teléfono.
- Correo.
- Edad del potencial jugador.
- Disciplina de interés.
- Categoría potencial.
- Fecha.
- Estado.
- Origen.
- Notas.
- Conversación asociada.

Estados iniciales: Nuevo, Contactado, Inscrito, Descartado.

No construir todavía pipeline comercial avanzado.

## 17. IA y Conversaciones [Etapa 2]

Este será uno de los principales componentes. La plataforma debe almacenar todas las conversaciones relevantes.

**Conversaciones**
- Listar conversaciones.
- Abrir conversación.
- Ver mensajes.
- Identificar persona.
- Relacionar jugador.
- Relacionar apoderado.
- Relacionar lead.
- Ver fecha y hora.
- Ver resumen automático.

**Análisis**

La IA debe detectar preguntas frecuentes, temas recurrentes, problemas frecuentes, información que genera confusión, consultas de potenciales nuevos jugadores y tendencias de conversación.

Ejemplos de insights:
- Muchas familias preguntan cómo probarse en el club.
- Aumentaron las consultas sobre pagos.
- Existe confusión sobre una categoría.
- Muchas personas están preguntando por uniformes.

## 18. Atención automática [v1.1 — Etapa 2]

La IA podrá responder consultas mediante WhatsApp a apoderados, jugadores, personas interesadas y familias nuevas.

Ejemplos:
- ¿Cómo puedo inscribir a mi hijo?
- ¿Cuánto cuesta?
- ¿Cómo me puedo probar en el club?
- ¿Qué categoría le corresponde?
- ¿Dónde entrenan?
- ¿A qué hora entrena?
- ¿Cómo pago?
- ¿Tengo pagos pendientes?
- ¿Cuánto debo pagar por el torneo?
- ¿Cómo va mi uniforme?

**Proceso de ingreso**

El club NO hace pruebas masivas. Si alguien escribe interesado, se le cita al próximo entrenamiento de la categoría que le corresponde. Existen requisitos formales para probarse (documento pendiente de entrega por el club).

La confirmación de asistencia y el aviso automático al entrenador quedan fuera del desarrollo por ahora (posible etapa futura).

**Formularios por WhatsApp (Flows vía Kapso)**
1. Pedido de uniformes (sección 12).
2. Solicitud de ingreso, incluida la pregunta de beca.
3. Documento de justificación deportiva: formulario breve de 2 a 3 preguntas; el backend completa el documento estándar y envía el PDF por WhatsApp.

## 19. Base de conocimiento [v1.1 — Etapa 2]

La IA debe responder utilizando información validada.

**Fuentes posibles**
- Documentación institucional.
- Datos de la base (Postgres).
- Horarios.
- Categorías.
- Torneos y campus.
- Pagos.
- Uniformes.
- Requisitos y proceso para probarse en el club.

Los documentos permanentes serán cargados y mantenidos por el desarrollador. No se necesita interfaz para que el club administre esa base inicialmente.

## 20. Restricciones de la IA

La IA:
- No debe inventar.
- No debe responder datos que no pueda validar.
- Debe reconocer cuando no dispone de información.
- Debe poder derivar cuando corresponda.
- Debe evitar revelar información privada a personas incorrectas.
- Debe registrar errores relevantes.

## 21. Horarios [Etapa 2]

Los horarios de entrenamiento serán información estable. Cada categoría tendrá días, hora de inicio, hora de término y lugar. La IA puede consultar esta información.

No administrar partidos, resultados ni cambios dinámicos de partidos.

## 22. Secciones descartadas [v1.1]

No implementar:
- Configuración.
- Gestión compleja de entrenadores (horarios, sueldos, asistencia, evaluación). La sección Entrenadores es solo una lista con credencial.
- Proveedores.
- Asistencia.
- Calendario completo.
- Reportes como sección.
- Documentos generales.
- Partidos.
- Resultados.
- Fixtures.
- Estadísticas deportivas.
- Notificaciones push deportivas.
- 2FA inicialmente.
- Gestión compleja de usuarios.
- Configuración del club desde el frontend.

## 23. Arquitectura tecnológica [v1.1]

La arquitectura debe mantenerse pequeña.

**Frontend**
- Aplicación web dentro del monorepo, alojada en **Vercel** (plan pago que el desarrollador ya tiene).
- Responsabilidades: UI, navegación, formularios, Dashboard, tablas, filtros y experiencia administrativa. También las páginas públicas de registro y de verificación de credenciales.
- Lovable se usa solo como origen del diseño: tras la auditoría inicial se desconecta por completo.
- Sin datos mock: lo que no está conectado a datos reales se muestra como "Pendiente".

**Base de datos**
- **PostgreSQL en Railway.** Supabase queda descartado.
- Es la fuente principal de datos de la plataforma.
- Etapa 1: Jugadores, Apoderados, Entrenadores, Solicitudes de registro y Categorías (mínima).
- Etapa 2: Torneos y campus, Participantes, Pagos, Uniformes, Leads, Conversaciones, Mensajes, Resúmenes y Horarios.

**Auth**
- En el backend propio. Inicialmente 1 o 2 usuarios, mismo nivel de acceso, creación manual.
- Mecanismo concreto por definir al implementar, con la opción más simple que sea segura.

**Archivos**
- Las fotos de credenciales (Etapa 1) se guardan en Postgres, en una tabla `fotos` aparte a la que apuntan las fichas, y se sirven solo a través del backend (nunca URLs públicas fijas). Así hay un solo volumen y un solo respaldo, y la foto y su ficha no pueden desincronizarse. Son unas 450 fotos comprimidas, cerca de 70 MB.
- Comprobantes de transferencia, documentos de torneos y archivos de procesos específicos (Etapa 2): dónde se guardan se decide al implementarlos.

## 24. Backend propio [v1.1]

Backend: Node.js, TypeScript, Fastify, alojado en Railway. Debe evitarse crear servicios adicionales salvo que sean necesarios.

El frontend nunca accede directo a la base de datos: todo pasa por el backend.

**Responsabilidades — Etapa 1**
- Acceso a datos y API del panel.
- Auth.
- Archivos (fotos).
- Registro, aprobación y credenciales QR.
- Validaciones.
- Seguridad.
- Logs.

**Responsabilidades — Etapa 2**
- WhatsApp (vía Kapso) y endpoints de datos de los Flows.
- IA.
- Webhooks.
- Leads.
- Conversaciones.
- Resúmenes.
- Analítica.
- Reportes.
- Reglas de negocio de pagos, becas, torneos y uniformes.
- Integraciones sensibles.
- Procesos programados críticos (por ejemplo, el consolidado de uniformes cada 15 días).

## 25. n8n [v1.1]

n8n será opcional y auxiliar. No será el backend principal. Si se usa, va en un proyecto Railway **separado** del backend de Club Colina y separado de la infraestructura de otros proyectos del desarrollador.

**Usos posibles**
- Conciliación con el sistema de pagos.
- Procesos externos simples.
- Automatizaciones que sean claramente más fáciles de mantener visualmente.

No utilizar n8n cuando una función pequeña en el backend sea más simple.

Regla: antes de crear un workflow preguntar "¿esto es más simple de mantener en n8n que en código?". Si no, implementar en backend.

Con los cambios de v1.1 (uniformes por Flow y email, sin planilla del proveedor) puede que n8n no llegue a ser necesario. No se usa en la Etapa 1.

## 26. Railway [v1.1]

Railway aloja el Backend, la base de datos Postgres y los archivos. Se usa el plan Pro que el desarrollador ya paga.

- No agregar Redis inicialmente.
- No agregar workers separados inicialmente.
- No agregar servicios adicionales hasta que exista una necesidad real.

## 27. WhatsApp [v1.1 — Etapa 2]

Kapso y toda la integración de WhatsApp se implementan en la Etapa 2. La Etapa 1 no depende de WhatsApp: el link de registro se comparte a mano.

- **Proveedor: Kapso**, plan Free (2.000 mensajes al mes, 1 número). Reemplaza a YCloud. Es el único proveedor.
- **Un solo número**, renombrado "Club Colina" (el que era de Basketball), para ambas disciplinas.
- **Coexistencia** con la app WhatsApp Business: el club sigue usando la app normalmente y el sistema usa el mismo número vía Kapso.
- El backend habla con Kapso a través de una capa delgada (un solo módulo), para poder migrar a Cloud API directa si hiciera falta.
- Salida prevista si se supera el plan Free: plan Pro (USD 25 al mes).
- No implementar GoHighLevel.

**Pendiente**
- Que el club cree la cuenta de Meta Business Manager y vincule el número.
- Confirmar con Kapso qué ocurre al superar los 2.000 mensajes.
- Decidir cómo se pagan los cargos de Meta (créditos Kapso o tarjeta directa) antes de crear la WABA.
- Probar la estabilidad de la coexistencia y que los Flows funcionen sobre un número en coexistencia.

## 28. Arquitectura de conversación [v1.1 — Etapa 2]

WhatsApp → Kapso → Webhook → Backend → Identificar remitente → Determinar intención → Consultar datos / conocimiento → IA → Validar respuesta → Enviar respuesta → Guardar conversación → Resumen + clasificación + insights

Las respuestas de la IA deben ser concisas, sin mensajes de relleno, y usar Flows en vez de conversaciones largas de ida y vuelta, porque cada mensaje cuenta para el plan y puede tener costo.

## 29. Fuente de verdad [v1.1]

La base Postgres en Railway es la fuente de verdad utilizada por el frontend y el backend.

Los sistemas externos pueden seguir siendo fuente original de ciertos procesos.

**Pagos**
- Fuente original: Forpay.
- Copia operacional: Postgres.

**Uniformes**
- Fuente original: el propio sistema (los pedidos nacen en el Flow).
- El proveedor recibe el consolidado por email.

## 30. Modelo de integración [v1.1]

Evitar dependencias en tiempo real innecesarias.

Preferir: Sistema externo → sincronización → Postgres

Sobre: Usuario → Backend → Sistema externo → esperar respuesta

Esto mejora velocidad, disponibilidad, mantenibilidad y resiliencia.

## 31. Manejo de errores

Implementar únicamente mecanismos razonables para el tamaño del proyecto.

**Necesario**
- Logs.
- Validaciones.
- Protección contra webhooks duplicados.
- Reintentos simples.
- Timeouts.
- Registro de errores.
- Estados de sincronización.

No construir infraestructura avanzada de observabilidad inicialmente.

## 32. Seguridad [v1.1]

- Nunca exponer: credenciales de la base de datos, tokens de Meta o Kapso, API keys de Forpay ni otras credenciales externas.
- Usar variables de entorno.
- La base de datos solo es accesible desde el backend. (Ya no aplica RLS de Supabase: el control de acceso se hace en el backend.)
- Validar webhooks externos.
- Datos de menores: los entrega el apoderado con consentimiento registrado, y se muestra lo mínimo necesario (Ley 21.719).
- Las páginas públicas (registro, verificación de credencial) usan tokens aleatorios largos y no exponen RUT ni datos de contacto.

## 33. Repositorio [v1.1]

El código vive en GitHub, en la cuenta **ignacioarrietafacuse** (`ignacioarrietafacuse/club-colina`), en un **monorepo** (reemplaza a los repos separados cc-frontend y cc-backend).

Estructura sugerida:

```
club-colina/
  frontend/
  backend/
  backend/migrations/
  docs/
  README.md
```

No crear múltiples repositorios salvo necesidad real.

## 34. Ambientes

Mínimo: Local y Producción.

No es obligatorio crear staging permanente inicialmente. Antes de producción se pueden usar ambientes temporales o branches cuando tenga sentido.

La prioridad es reducir costos y complejidad.

## 35. Desarrollo con Claude Code

Claude Code será la principal herramienta de desarrollo.

**Fable / Opus — Rol**
- Arquitectura.
- Planificación.
- Orquestación.
- División del trabajo.
- Revisión.
- QA conceptual.
- Control de deuda técnica.

**Sonnet — Rol**
- Implementación.
- Código.
- Migraciones.
- Endpoints.
- Servicios.
- Tests.
- Correcciones.

## 36. Regla para Claude

Claude NO debe transformar este proyecto en SaaS multitenant, microservicios, arquitectura empresarial, event-driven architecture compleja, Kubernetes, sistema distribuido o framework innecesariamente pesado.

La prioridad es: el menor número de componentes capaces de resolver correctamente el problema.

## 37. Orden de desarrollo [v1.1]

El desarrollo se divide en dos etapas. La Etapa 1 es urgente y no depende de información del club más allá de la lista de categorías. La Etapa 2 empieza cuando el club entregue la información pendiente (sección 38).

### Etapa 1 — Primer levantamiento (urgente)

**1.1 Frontend base**
- Revisar el proyecto Lovable y pasar el frontend al monorepo.
- Mantener la UI existente siempre que sea posible.
- **Eliminar todos los datos mock.**
- Dejar las secciones de la Etapa 2 con estado "Pendiente".
- Desconectar Lovable.

**1.2 Modelo de datos base**
- Tablas: apoderados, jugadores, vínculo jugador-apoderado, entrenadores, categorías (mínima) y solicitudes de registro.
- Migraciones de Postgres.

**1.3 Backend mínimo**
- API del panel, auth, archivos (fotos), validaciones y logs.

**1.4 Registro y credenciales**
- Formulario público de registro (apoderado o jugador adulto) con foto y consentimiento.
- Link privado de familia con el estado y los QR.
- Página pública de verificación del QR.

**1.5 Panel**
- Login.
- Solicitudes pendientes: aprobar, rechazar, corregir categoría y número, asignar becas.
- Secciones Jugadores y Apoderados con datos reales.
- Sección Entrenadores: crear entrenador a mano (con foto) y descargar su QR.
- Dashboard con los indicadores disponibles y el resto como "Pendiente".

**1.6 QA de la Etapa 1**
- Probar registro, aprobación, escaneo y casos de error (QR inválido, RUT duplicado, foto faltante).

### Etapa 2 — Resto del sistema (cuando el club entregue la información)

El orden interno se confirma al iniciar la etapa. Propuesta:
1. Categorías completas y horarios.
2. Torneos y campus.
3. WhatsApp + IA (Kapso, webhook, identificación, respuestas, registro de conversaciones, resúmenes, clasificación) y Flows de solicitud de ingreso y justificación deportiva.
4. Leads.
5. Uniformes (Flow de pedido, validación de número, comprobante, confirmación manual, consolidado por email cada 15 días).
6. Pagos (Forpay: webhooks, suscripción por apoderado, cálculo con becas).
7. Dashboard completo y reportes descargables.
8. QA general.

A medida que cada sección se construye, su estado "Pendiente" se reemplaza por la funcionalidad real.

## 38. Decisiones pendientes [v1.1]

**Resueltas desde v1.0**
- Pasarela de pagos: Forpay.
- Becas: existen; porcentaje por jugador y concepto.
- WhatsApp: un número, Kapso, coexistencia.
- Uniformes: pedido por Flow y consolidado por email.

**Necesario para la Etapa 1**
- Lista de categorías por rama, con nombres exactos.

**Necesario para la Etapa 2**

*Registro*
- Qué más quiere completar el club al aprobar (los métodos de pago ya están confirmados, sección 9A).

*Uniformes*
- Cómo se actualizan los estados del pedido después del envío al proveedor.

*Pagos*
- Credenciales de API de Forpay (en gestión con la ejecutiva).

*WhatsApp*
- Cuenta de Meta Business Manager del club y vinculación del número.
- Comportamiento de Kapso al superar el plan Free y forma de pago de los cargos de Meta.

*Torneos y campus*
- Cómo controlan hoy participantes, pagos y documentos.

*Documentos que el club debe entregar*
- Documentos generales de Basketball y Voleibol.
- Reglamento y formularios del club.
- Brochures de torneos (2 o 3).
- Documento de justificación deportiva estándar, con firmas.
- Listado de precios de todas las categorías.
- Capturas de conversaciones de incorporación al club.
- Requisitos para probarse en el club.
- Horarios y lugar de entrenamiento de cada categoría.

Jugadores y apoderados: el club ya entregó la base de inscripciones 2026, que se importa una sola vez como "precargados" (`docs/diseno-credenciales-qr.md`, "Carga inicial"); el formulario de registro completa lo que falta (foto y número de camiseta) y queda como proceso permanente de ingreso (sección 9A). No se piden listados de entrenadores ni números de camiseta: los entrenadores los crea el club en el panel (sección 9B).

## 39. Alcance por etapa [v1.1]

**Etapa 1**
- Login.
- Registro por link con aprobación del club.
- Credenciales QR para jugadores, apoderados y entrenadores.
- Jugadores.
- Apoderados.
- Entrenadores.
- Dashboard con indicadores reales de lo anterior y el resto como "Pendiente".
- Sin datos mock.

**Etapa 2**
- Categorías.
- Torneos y campus.
- Uniformes.
- Leads.
- Pagos.
- Conversaciones.
- WhatsApp.
- IA.
- Respuestas basadas en información real.
- Resúmenes automáticos.
- Análisis básico.
- Dashboard completo.
- Reportes descargables.

No agregar funcionalidades fuera de este alcance sin validación.

## 40. Criterios de éxito [v1.1]

**Etapa 1**
- El club puede identificar a jugadores, apoderados y entrenadores en la entrada.
- La base de jugadores y apoderados queda cargada: se importa una sola vez desde la base de inscripciones 2026 y las propias familias la completan con el formulario, sin que el club tenga que corregir planillas.
- El panel no muestra ningún dato que no sea real.

**Sistema completo**
- La administración trabaja desde una sola plataforma.
- Se reduce el tiempo respondiendo WhatsApp.
- La IA responde correctamente preguntas frecuentes.
- Los apoderados obtienen información rápidamente.
- Los pagos son fáciles de consultar.
- El estado de uniformes es fácil de consultar.
- Los torneos y campus son fáciles de administrar.
- Los interesados quedan registrados.
- La información es fácil de encontrar.
- El sistema requiere poco mantenimiento técnico.
- Los costos mensuales permanecen bajos.

## 41. Principio final

Este documento no obliga a implementar literalmente cada decisión.

Durante el desarrollo, si existe una alternativa que sea más simple, más barata, más estable, más fácil de mantener o más segura, Claude debe proponerla antes de implementar.

La prioridad no es construir la arquitectura más sofisticada.

La prioridad es: construir la solución más simple y confiable que resuelva correctamente los problemas de Club Colina.
