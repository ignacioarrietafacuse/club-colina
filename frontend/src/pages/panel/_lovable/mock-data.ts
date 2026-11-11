// Mock data for Club Colina demo platform. All data is fictional.

export type Discipline = "basketball" | "volleyball";

export const disciplines: Record<Discipline, { label: string; color: string; icon: string }> = {
  basketball: { label: "Basketball", color: "text-accent", icon: "🏀" },
  volleyball: { label: "Voleibol", color: "text-secondary", icon: "🏐" },
};

export const categories = ["U10", "U12", "U13", "U15", "U17", "U19", "Adulto"];

export type Team = {
  id: string; name: string; discipline: Discipline; coach: string; players: number;
  category: string;
  entrenamientos: { dias: string; hora: string; lugar: string };
  responsable?: { nombre: string; telefono: string; email: string; observaciones?: string };
};

export const teams: Team[] = [
  { id: "t1", name: "Colina Basketball U13", discipline: "basketball", coach: "Rodrigo Salinas", players: 14, category: "U13",
    entrenamientos: { dias: "Martes y jueves", hora: "17:00 – 18:30", lugar: "Gimnasio Municipal" } },
  { id: "t2", name: "Colina Basketball U15", discipline: "basketball", coach: "Rodrigo Salinas", players: 15, category: "U15",
    entrenamientos: { dias: "Lunes, miércoles y viernes", hora: "18:00 – 19:30", lugar: "Gimnasio Municipal" } },
  { id: "t3", name: "Colina Basketball U17", discipline: "basketball", coach: "Fernanda Correa", players: 13, category: "U17",
    entrenamientos: { dias: "Martes y jueves", hora: "19:00 – 20:30", lugar: "Cancha Casa" } },
  { id: "t4", name: "Colina Basketball Adulto", discipline: "basketball", coach: "Cristián Moreno", players: 12, category: "Adulto",
    entrenamientos: { dias: "Lunes y miércoles", hora: "20:30 – 22:00", lugar: "Gimnasio Municipal" } },
  { id: "t5", name: "Colina Voleibol U13 Femenino", discipline: "volleyball", coach: "Camila Pérez", players: 12, category: "U13",
    entrenamientos: { dias: "Martes y jueves", hora: "17:30 – 19:00", lugar: "Gimnasio Municipal" } },
  { id: "t6", name: "Colina Voleibol U15 Femenino", discipline: "volleyball", coach: "Camila Pérez", players: 14, category: "U15",
    entrenamientos: { dias: "Lunes, miércoles y viernes", hora: "18:30 – 20:00", lugar: "Gimnasio Municipal" } },
  { id: "t7", name: "Colina Voleibol U17 Femenino", discipline: "volleyball", coach: "María José Vargas", players: 13, category: "U17",
    entrenamientos: { dias: "Martes y jueves", hora: "19:30 – 21:00", lugar: "Cancha Casa" } },
  { id: "t8", name: "Colina Voleibol Adulto", discipline: "volleyball", coach: "María José Vargas", players: 14, category: "Adulto",
    entrenamientos: { dias: "Lunes y miércoles", hora: "21:00 – 22:30", lugar: "Gimnasio Municipal" } },
];

const nombres = ["Benjamín","Martín","Diego","Matías","Vicente","Joaquín","Tomás","Nicolás","Sebastián","Agustín","Cristóbal","Ignacio","Lucas","Emilio","Bruno","Gabriel","Emiliano","Rafael","Simón","Andrés","Felipe","Javier","Maximiliano","Franco","Renato","Pablo","Isidora","Sofía","Antonia","Catalina","Josefa","Emilia","Amanda","Florencia","Fernanda","Trinidad","Magdalena","Valentina","Constanza","Javiera","Camila","Rocío","Bárbara","Anaís","Mía","Julieta","Elisa","Martina","Antonella","Renata"];
const apellidos = ["González","Muñoz","Rojas","Díaz","Pérez","Soto","Contreras","Silva","Martínez","Sepúlveda","Morales","Rodríguez","López","Fuentes","Hernández","Torres","Araya","Flores","Espinoza","Valenzuela","Castillo","Tapia","Reyes","Gutiérrez","Vega","Vargas","Herrera","Núñez","Cortés","Fernández"];

function seed(i: number, arr: string[]) { return arr[i % arr.length]; }

const posturasBasket = ["Base", "Escolta", "Alero", "Ala-Pívot", "Pívot"];
const posturasVolley = ["Colocadora", "Opuesta", "Central", "Receptora-Punta", "Líbero"];
const estados = ["Activo", "Activo", "Activo", "Activo", "Lesionado", "En prueba"] as const;
const pagos = ["Al día", "Al día", "Al día", "Pendiente", "Al día", "Atrasado"] as const;

export type Player = {
  id: string; nombre: string; apellido: string; edad: number; categoria: string;
  disciplina: Discipline; equipo: string; posicion: string; estado: typeof estados[number];
  pago: typeof pagos[number]; apoderado: string; email: string; ingreso: string;
  ultimoPago: string; jerseyNumber: number;
};

export const players: Player[] = Array.from({ length: 96 }).map((_, i) => {
  const nombre = seed(i * 7 + 3, nombres);
  const apellido = seed(i * 11 + 5, apellidos);
  const discipline: Discipline = i % 2 === 0 ? "basketball" : "volleyball";
  const catIdx = i % 6;
  const cat = ["U10","U12","U13","U15","U17","Adulto"][catIdx];
  const edadBase: Record<string,number> = {U10:9,U12:11,U13:13,U15:15,U17:17,Adulto:22};
  const equipoPool = teams.filter(t => t.discipline === discipline);
  const equipo = equipoPool[i % equipoPool.length].name;
  const pago = pagos[i % pagos.length];
  return {
    id: `p${i + 1}`,
    nombre,
    apellido,
    edad: edadBase[cat] + (i % 2),
    categoria: cat,
    disciplina: discipline,
    equipo,
    posicion: discipline === "basketball" ? seed(i, posturasBasket) : seed(i, posturasVolley),
    estado: estados[i % estados.length],
    pago,
    apoderado: `${seed(i * 3 + 1, nombres)} ${seed(i * 5 + 2, apellidos)}`,
    email: `${nombre.toLowerCase()}.${apellido.toLowerCase()}@familia.cl`.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    ingreso: `${2020 + (i % 5)}-0${1 + (i % 9)}-${10 + (i % 18)}`,
    ultimoPago: pago === "Al día" ? `2026-07-0${1 + (i % 9)}` : pago === "Pendiente" ? "2026-06-05" : "2026-05-02",
    jerseyNumber: (i % 45) + 4,
  };
});

export const apoderados = Array.from({ length: 60 }).map((_, i) => ({
  id: `a${i + 1}`,
  nombre: `${seed(i * 3, nombres)} ${seed(i * 7, apellidos)}`,
  telefono: `+56 9 ${String(30000000 + i * 12345).slice(0, 8)}`,
  email: `apoderado${i + 1}@correo.cl`,
  hijos: 1 + (i % 3),
  estadoPago: pagos[i % pagos.length],
  ultimoPago: `2026-0${1 + (i % 7)}-${5 + (i % 20)}`,
  ultimaComunicacion: ["Hoy", "Ayer", "Hace 3 días", "Hace 1 semana", "Hace 2 semanas"][i % 5],
  canalComunicacion: (["Email", "WhatsApp", "Llamada"] as const)[i % 3],
  notas: i % 4 === 0 ? "Prefiere WhatsApp" : "",
}));

export type Entrenador = {
  id: string; nombre: string; disciplina: Discipline; equipos: string[];
  categorias: string[]; especialidad: string; experiencia: number;
  certificaciones: string[]; telefono: string; email: string; estado: string;
};

export const entrenadores: Entrenador[] = [
  { id: "c1", nombre: "Rodrigo Salinas", disciplina: "basketball", equipos: ["U13", "U15"], categorias: ["U13", "U15"], especialidad: "Formativas — Fundamentos", experiencia: 12,
    certificaciones: ["FIBA Nivel 2", "Entrenador Nacional ANFP"], telefono: "+56 9 8765 4321", email: "rsalinas@clubcolina.cl", estado: "Activo" },
  { id: "c2", nombre: "Fernanda Correa", disciplina: "basketball", equipos: ["U17"], categorias: ["U17"], especialidad: "Alto rendimiento juvenil", experiencia: 8,
    certificaciones: ["FIBA Nivel 1", "Preparación Física CAR"], telefono: "+56 9 8712 3344", email: "fcorrea@clubcolina.cl", estado: "Activo" },
  { id: "c3", nombre: "Cristián Moreno", disciplina: "basketball", equipos: ["Adulto"], categorias: ["Adulto"], especialidad: "Rama adulta competitiva", experiencia: 15,
    certificaciones: ["FIBA Nivel 3", "Máster en Deporte UDD"], telefono: "+56 9 8555 1122", email: "cmoreno@clubcolina.cl", estado: "Activo" },
  { id: "c4", nombre: "Camila Pérez", disciplina: "volleyball", equipos: ["U13", "U15"], categorias: ["U13", "U15"], especialidad: "Iniciación y técnica", experiencia: 10,
    certificaciones: ["FIVB Nivel 2", "Instructora Federación Chilena"], telefono: "+56 9 8434 5566", email: "cperez@clubcolina.cl", estado: "Activo" },
  { id: "c5", nombre: "María José Vargas", disciplina: "volleyball", equipos: ["U17", "Adulto"], categorias: ["U17", "Adulto"], especialidad: "Alto rendimiento y táctica", experiencia: 14,
    certificaciones: ["FIVB Nivel 3", "Ex-selección nacional"], telefono: "+56 9 8321 7788", email: "mvargas@clubcolina.cl", estado: "Activo" },
  { id: "c6", nombre: "Andrés Tapia", disciplina: "basketball", equipos: ["Todas"], categorias: ["Todas"], especialidad: "Preparación física integral", experiencia: 9,
    certificaciones: ["Kinesiólogo Deportivo", "NSCA-CPT"], telefono: "+56 9 8200 9911", email: "atapia@clubcolina.cl", estado: "Activo" },
];

export const eventos = [
  { id: "e1", titulo: "Entrenamiento U13 Basketball", fecha: "2026-07-22", hora: "17:00", tipo: "Entrenamiento", equipo: "Colina Basketball U13", lugar: "Gimnasio Municipal" },
  { id: "e3", titulo: "Entrenamiento Voleibol U15", fecha: "2026-07-22", hora: "18:30", tipo: "Entrenamiento", equipo: "Colina Voleibol U15", lugar: "Gimnasio Municipal" },
  { id: "e4", titulo: "Pruebas masivas 2026", fecha: "2026-07-27", hora: "10:00", tipo: "Evento", equipo: "Todas las categorías", lugar: "Complejo Deportivo Colina" },
  { id: "e6", titulo: "Reunión de apoderados", fecha: "2026-07-25", hora: "20:00", tipo: "Reunión", equipo: "Apoderados", lugar: "Sala Multiuso" },
  { id: "e7", titulo: "Entrenamiento Adulto Voleibol", fecha: "2026-07-24", hora: "21:00", tipo: "Entrenamiento", equipo: "Colina Voleibol Adulto", lugar: "Gimnasio Municipal" },
  { id: "e9", titulo: "Entrenamiento Basketball U15", fecha: "2026-07-23", hora: "18:00", tipo: "Entrenamiento", equipo: "Colina Basketball U15", lugar: "Gimnasio Municipal" },
];

export const entrenamientosHoy = [
  { id: "eh1", equipo: "Basketball U13", hora: "17:00 – 18:30", lugar: "Gimnasio Municipal", entrenador: "Rodrigo Salinas", jugadores: 14 },
  { id: "eh2", equipo: "Voleibol U15 Femenino", hora: "18:30 – 20:00", lugar: "Gimnasio Municipal", entrenador: "Camila Pérez", jugadores: 14 },
  { id: "eh3", equipo: "Basketball U17", hora: "19:00 – 20:30", lugar: "Cancha Casa", entrenador: "Fernanda Correa", jugadores: 13 },
  { id: "eh4", equipo: "Voleibol Adulto", hora: "21:00 – 22:30", lugar: "Gimnasio Municipal", entrenador: "María José Vargas", jugadores: 14 },
];

export const pagosData = Array.from({ length: 40 }).map((_, i) => ({
  id: `pg${i + 1}`,
  jugador: `${seed(i * 5, nombres)} ${seed(i * 3, apellidos)}`,
  concepto: ["Mensualidad Julio", "Mensualidad Junio", "Uniforme oficial", "Inscripción torneo", "Cuota anual"][i % 5],
  monto: [45000, 45000, 65000, 25000, 120000][i % 5],
  fecha: `2026-07-${(i % 28) + 1}`,
  estado: (["Pagado", "Pagado", "Pendiente", "Pagado", "Atrasado"] as const)[i % 5],
  metodo: ["Transferencia", "Webpay", "Efectivo", "Transferencia"][i % 4],
}));

// ===== Uniformes =====
// El proveedor externo confecciona. La plataforma solo visualiza el estado sincronizado.
export const uniformeEstados = [
  "Pedido recibido",
  "En producción",
  "Listo para despacho",
  "Enviado",
  "Disponible para retiro",
  "Entregado",
] as const;
export type UniformeEstado = typeof uniformeEstados[number];

export type Uniforme = {
  id: string; jugador: string; categoria: string; disciplina: Discipline;
  prenda: string; talla: string; estado: UniformeEstado;
  fechaPedido: string; fechaEstimada: string; actualizado: string;
  observaciones: string; numero: number;
};

const prendas = ["Camiseta oficial", "Short oficial", "Buzo institucional", "Polera de entrenamiento", "Chaqueta de viaje", "Camiseta alternativa"];
const observacionesPool = [
  "",
  "Solicita dorsal personalizado.",
  "Cambio de talla confirmado con el apoderado.",
  "Retiro coordinado para el sábado.",
  "",
  "Pedido incluido en el lote del torneo.",
];

export const uniformes: Uniforme[] = Array.from({ length: 28 }).map((_, i) => {
  const team = teams[i % teams.length];
  const estado = uniformeEstados[i % uniformeEstados.length];
  return {
    id: `u${i + 1}`,
    jugador: `${seed(i * 4, nombres)} ${seed(i * 6, apellidos)}`,
    categoria: team.category,
    disciplina: team.discipline,
    prenda: prendas[i % prendas.length],
    talla: ["XS", "S", "M", "L", "XL"][i % 5],
    estado,
    fechaPedido: `2026-06-${String((i % 27) + 1).padStart(2, "0")}`,
    fechaEstimada: `2026-08-${String((i % 26) + 2).padStart(2, "0")}`,
    actualizado: ["Hoy", "Hoy", "Ayer", "Hace 2 días", "Hace 4 días", "Hace 1 semana"][i % 6],
    observaciones: observacionesPool[i % observacionesPool.length],
    numero: (i % 45) + 4,
  };
});


export const documentos = [
  { id: "d1", nombre: "Reglamento Interno 2026", tipo: "PDF", tamaño: "1.2 MB", categoria: "Legal", actualizado: "2026-03-15" },
  { id: "d2", nombre: "Ficha médica - Formato oficial", tipo: "PDF", tamaño: "340 KB", categoria: "Médico", actualizado: "2026-02-10" },
  { id: "d3", nombre: "Autorización de salida", tipo: "DOCX", tamaño: "80 KB", categoria: "Legal", actualizado: "2026-04-02" },
  { id: "d4", nombre: "Calendario oficial 2026", tipo: "PDF", tamaño: "2.4 MB", categoria: "Deportivo", actualizado: "2026-01-20" },
  { id: "d5", nombre: "Protocolo de lesiones", tipo: "PDF", tamaño: "890 KB", categoria: "Médico", actualizado: "2026-05-12" },
  { id: "d6", nombre: "Manual del entrenador", tipo: "PDF", tamaño: "3.1 MB", categoria: "Deportivo", actualizado: "2026-04-28" },
  { id: "d7", nombre: "Contrato de patrocinio - Sportlife", tipo: "PDF", tamaño: "620 KB", categoria: "Legal", actualizado: "2026-06-01" },
  { id: "d8", nombre: "Presentación institucional", tipo: "PPTX", tamaño: "8.5 MB", categoria: "Institucional", actualizado: "2026-06-20" },
];


export const ingresosMensuales = [
  { mes: "Ene", ingresos: 8200000, egresos: 5100000 },
  { mes: "Feb", ingresos: 8500000, egresos: 5300000 },
  { mes: "Mar", ingresos: 9100000, egresos: 5800000 },
  { mes: "Abr", ingresos: 8900000, egresos: 5600000 },
  { mes: "May", ingresos: 9400000, egresos: 6100000 },
  { mes: "Jun", ingresos: 9700000, egresos: 5900000 },
  { mes: "Jul", ingresos: 10200000, egresos: 6200000 },
];

export const comunicados = [
  { id: "co1", titulo: "Cierre de inscripciones Copa Amistad U17", autor: "Fernanda Correa", fecha: "Hoy · 09:12", alcance: "Apoderados U17" },
  { id: "co2", titulo: "Recordatorio: reunión de apoderados 25 de julio", autor: "Dirección", fecha: "Ayer · 18:45", alcance: "Todos los apoderados" },
  { id: "co3", titulo: "Nuevos horarios de entrenamiento Voleibol U15", autor: "Camila Pérez", fecha: "Hace 2 días", alcance: "Voleibol U15" },
];

export const actividadReciente = [
  { id: "ar1", tipo: "jugador", texto: "Isidora Rojas fue inscrita en Voleibol U13 Femenino", hace: "hace 8 min", por: "Administración" },
  { id: "ar2", tipo: "pago", texto: "Martín Muñoz pagó la mensualidad de Julio ($45.000)", hace: "hace 22 min", por: "Webpay" },
  { id: "ar3", tipo: "lead", texto: "Nuevo lead: Familia Rojas consultó por Voleibol U13 vía IA", hace: "hace 41 min", por: "Asistente IA" },
  { id: "ar4", tipo: "ia", texto: "La IA respondió 42 consultas hoy · 96% resueltas en el primer intento", hace: "hace 1 h", por: "Asistente IA" },
  { id: "ar5", tipo: "documento", texto: "Se publicó el nuevo Reglamento Interno 2026", hace: "hace 2 h", por: "Dirección" },
  { id: "ar6", tipo: "prueba", texto: "Se creó una nueva prueba masiva para el 27 de julio", hace: "hace 3 h", por: "Administración" },
  { id: "ar7", tipo: "comunicado", texto: "Se envió un comunicado a 118 apoderados de U15", hace: "hace 5 h", por: "Fernanda Correa" },
  { id: "ar8", tipo: "pago", texto: "Nueva mensualidad pendiente detectada · Familia Torres", hace: "hace 6 h", por: "Sistema" },
];

export const notificacionesRecientes = [
  { id: "n1", tipo: "pago", texto: "Martín González completó su mensualidad de Julio", hace: "hace 12 min" },
  { id: "n2", tipo: "prueba", texto: "34 postulantes inscritos para las pruebas masivas del 27 de julio", hace: "hace 34 min" },
  { id: "n3", tipo: "torneo", texto: "Torneo Copa Chicureo 2026 · 4 apoderados aún no pagan la cuota de viaje", hace: "hace 1 h" },
  { id: "n4", tipo: "ia", texto: "IA resolvió 42 consultas de apoderados hoy", hace: "hace 2 h" },
  { id: "n5", tipo: "documento", texto: "Reglamento Interno 2026 actualizado", hace: "hace 5 h" },
];

export const uniformesListos = uniformes.filter(u => u.estado === "Disponible para retiro");
export const uniformesActivos = uniformes.filter(u => u.estado !== "Entregado");


export type Conversation = { id: string; titulo: string; cuando: string; mensajes: { role: "user" | "assistant"; content: string }[] };

export const conversacionesIA: Conversation[] = [
  {
    id: "cv1", titulo: "Próximas pruebas masivas", cuando: "hoy",
    mensajes: [
      { role: "user", content: "¿Cuándo son las próximas pruebas masivas?" },
      { role: "assistant", content: "Las próximas **pruebas masivas 2026** son el **sábado 27 de julio a las 10:00** en el Complejo Deportivo Colina. Hay cupos para **U10, U12, U13 y U15** en Basketball y Voleibol. Se inscribieron 34 postulantes hasta el momento." },
      { role: "user", content: "¿Y qué necesitan traer los postulantes?" },
      { role: "assistant", content: "Cada postulante debe traer:\n\n• Ropa deportiva y zapatillas para cancha\n• Botella de agua personal\n• Certificado médico (o firmar declaración simple)\n• Autorización del apoderado (adjunta en Documentos → Legal)\n\nLa recepción es a las 09:30. Si el apoderado se atrasa, la evaluación no se pierde." },
    ],
  },
  {
    id: "cv2", titulo: "Inscripción de un hijo/a", cuando: "hoy",
    mensajes: [
      { role: "user", content: "¿Cómo inscribo a mi hijo en el club?" },
      { role: "assistant", content: "Perfecto. El proceso de inscripción es 100% digital y toma menos de 5 minutos:\n\n1. Ir a **Jugadores → Nuevo jugador**\n2. Completar los datos del deportista y del apoderado\n3. Subir la ficha médica (formato en Documentos)\n4. Realizar el pago de inscripción ($120.000 CLP)\n\nAl finalizar recibirás el contrato y credencial digital por correo. ¿Quieres que abra el formulario ahora?" },
    ],
  },
  {
    id: "cv3", titulo: "Costo de pertenecer al club", cuando: "hoy",
    mensajes: [
      { role: "user", content: "¿Cuánto cuesta pertenecer al club?" },
      { role: "assistant", content: "Los valores 2026 son:\n\n• **Inscripción anual:** $120.000 CLP\n• **Mensualidad:** $45.000 CLP\n• **Uniforme oficial:** $65.000 CLP (una vez)\n\nIncluye entrenamientos regulares, participación en torneos oficiales, seguro deportivo y preparación física. Familias con **2 o más hijos** tienen 15% de descuento a partir del segundo." },
    ],
  },
  {
    id: "cv4", titulo: "Estado del uniforme", cuando: "ayer",
    mensajes: [
      { role: "user", content: "¿Cómo va mi uniforme?" },
      { role: "assistant", content: "Revisé el módulo de **Uniformes**. El pedido registrado a nombre de **Martín Muñoz** (Basketball U15) está **En producción** con el proveedor externo.\n\n• Prenda: Camiseta oficial + short\n• Talla registrada: **M** · dorsal 12\n• Fecha del pedido: 12 de junio\n• Fecha estimada: **8 de agosto**\n• Última actualización: hoy\n\nTe aviso automáticamente cuando cambie a *Disponible para retiro*." },
      { role: "user", content: "¿Qué talla quedó registrada?" },
      { role: "assistant", content: "La talla registrada es **M** (camiseta y short). Si necesitas cambiarla, se puede hasta que el pedido pase a *Listo para despacho*; hoy está **En producción**, así que aún alcanzamos a solicitar el cambio." },
    ],
  },
  {
    id: "cv7", titulo: "¿Ya llegó el uniforme?", cuando: "hoy",
    mensajes: [
      { role: "user", content: "¿Ya llegó mi uniforme?" },
      { role: "assistant", content: "Sí 🎉 El uniforme de **Isidora Rojas** (Voleibol U13, talla S) está **Disponible para retiro** desde hoy en la oficina del club.\n\nHorario de retiro: **lunes a viernes de 10:00 a 19:00** y sábados de 10:00 a 13:00." },
      { role: "user", content: "¿Cuándo estará listo el de mi otro hijo?" },
      { role: "assistant", content: "El segundo pedido de la familia (**Buzo institucional**, Basketball U15, talla L) está **Enviado** por el proveedor. Fecha estimada de llegada al club: **6 de agosto**. Última actualización: ayer." },
    ],
  },

  {
    id: "cv5", titulo: "Ubicación del reglamento", cuando: "ayer",
    mensajes: [
      { role: "user", content: "¿Dónde encuentro el reglamento?" },
      { role: "assistant", content: "El **Reglamento Interno 2026** está en **Documentos → Legal**. Última actualización: 15 de marzo de 2026 (PDF, 1.2 MB). También incluye:\n\n• Código de conducta deportiva\n• Protocolo médico y de lesiones\n• Política de uniformes y credenciales\n\n¿Quieres que te lo envíe por email?" },
    ],
  },
  {
    id: "cv6", titulo: "Horarios de entrenamiento", cuando: "hace 2 días",
    mensajes: [
      { role: "user", content: "¿Cuáles son los horarios de entrenamiento?" },
      { role: "assistant", content: "Estos son los horarios fijos por equipo:\n\n**Basketball**\n• U13 — Martes y jueves 17:00 – 18:30 · Gimnasio Municipal\n• U15 — Lunes, miércoles y viernes 18:00 – 19:30 · Gimnasio Municipal\n• U17 — Martes y jueves 19:00 – 20:30 · Cancha Casa\n• Adulto — Lunes y miércoles 20:30 – 22:00 · Gimnasio Municipal\n\n**Voleibol**\n• U13 Femenino — Martes y jueves 17:30 – 19:00 · Gimnasio Municipal\n• U15 Femenino — Lunes, miércoles y viernes 18:30 – 20:00 · Gimnasio Municipal\n• U17 Femenino — Martes y jueves 19:30 – 21:00 · Cancha Casa\n• Adulto — Lunes y miércoles 21:00 – 22:30 · Gimnasio Municipal" },
    ],
  },
];

export function formatCLP(n: number) {
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
}

// Lookup: profesor responsable de una categoría/equipo.
export function getResponsable(team: Team) {
  if (team.responsable) return team.responsable;
  const e = entrenadores.find(en => en.nombre === team.coach);
  return {
    nombre: team.coach,
    telefono: e?.telefono ?? "+56 9 0000 0000",
    email: e?.email ?? "contacto@clubcolina.cl",
    observaciones: e?.especialidad,
  };
}

export type Torneo = {
  id: string; nombre: string; ciudad: string; pais: string;
  fechaInicio: string; fechaTermino: string; descripcion: string;
  responsable: { nombre: string; telefono: string; email: string };
  categorias: string[]; disciplina: Discipline;
  jugadores: { id: string; nombre: string; categoria: string; pago: "Pagado" | "Pendiente" | "Atrasado"; monto: number }[];
  documentos: { nombre: string; tipo: string }[];
  estado: "Próximo" | "En curso" | "Cerrado";
};

export const torneos: Torneo[] = [
  {
    id: "tr1", nombre: "Copa Chicureo 2026", ciudad: "Colina", pais: "Chile",
    fechaInicio: "2026-08-14", fechaTermino: "2026-08-17",
    descripcion: "Torneo formativo regional. Fase de grupos + eliminatorias. Alojamiento incluido para categorías U15 y U17.",
    responsable: { nombre: "Rodrigo Salinas", telefono: "+56 9 8765 4321", email: "rsalinas@clubcolina.cl" },
    categorias: ["U13", "U15", "U17"], disciplina: "basketball",
    jugadores: Array.from({ length: 18 }).map((_, i) => ({
      id: `trp1-${i}`, nombre: `${seed(i * 3, nombres)} ${seed(i * 5, apellidos)}`,
      categoria: ["U13", "U15", "U17"][i % 3],
      pago: (["Pagado", "Pagado", "Pagado", "Pendiente", "Pagado", "Atrasado"] as const)[i % 6],
      monto: 180000,
    })),
    documentos: [
      { nombre: "Itinerario oficial", tipo: "PDF" },
      { nombre: "Reglamento del torneo", tipo: "PDF" },
      { nombre: "Autorización notarial", tipo: "DOCX" },
      { nombre: "Reserva Hotel Colina Suites", tipo: "PDF" },
      { nombre: "Recomendaciones de viaje", tipo: "PDF" },
    ],
    estado: "Próximo",
  },
  {
    id: "tr2", nombre: "Gira Sur Voleibol Femenino", ciudad: "Puerto Varas", pais: "Chile",
    fechaInicio: "2026-09-25", fechaTermino: "2026-09-29",
    descripcion: "Gira formativa con partidos amistosos y clínicas técnicas. 3 días de viaje + 2 de competencia.",
    responsable: { nombre: "María José Vargas", telefono: "+56 9 8321 7788", email: "mvargas@clubcolina.cl" },
    categorias: ["U15", "U17"], disciplina: "volleyball",
    jugadores: Array.from({ length: 14 }).map((_, i) => ({
      id: `trp2-${i}`, nombre: `${seed(i * 4 + 1, nombres)} ${seed(i * 6, apellidos)}`,
      categoria: ["U15", "U17"][i % 2],
      pago: (["Pagado", "Pendiente", "Pagado", "Pagado"] as const)[i % 4],
      monto: 320000,
    })),
    documentos: [
      { nombre: "Itinerario detallado", tipo: "PDF" },
      { nombre: "Autorización de salida", tipo: "DOCX" },
      { nombre: "Ficha del hotel Cabañas del Lago", tipo: "PDF" },
      { nombre: "Información general del viaje", tipo: "PDF" },
    ],
    estado: "Próximo",
  },
  {
    id: "tr3", nombre: "Internacional Mendoza Youth Cup", ciudad: "Mendoza", pais: "Argentina",
    fechaInicio: "2026-11-06", fechaTermino: "2026-11-10",
    descripcion: "Torneo internacional invitacional. Requiere pasaporte vigente y autorización notarial.",
    responsable: { nombre: "Fernanda Correa", telefono: "+56 9 8712 3344", email: "fcorrea@clubcolina.cl" },
    categorias: ["U17"], disciplina: "basketball",
    jugadores: Array.from({ length: 12 }).map((_, i) => ({
      id: `trp3-${i}`, nombre: `${seed(i * 5, nombres)} ${seed(i * 7, apellidos)}`,
      categoria: "U17",
      pago: (["Pendiente", "Pagado", "Pagado", "Pendiente", "Pagado"] as const)[i % 5],
      monto: 620000,
    })),
    documentos: [
      { nombre: "Reglamento internacional", tipo: "PDF" },
      { nombre: "Autorización notarial de salida del país", tipo: "PDF" },
      { nombre: "Itinerario y vuelos", tipo: "PDF" },
      { nombre: "Reserva hotel Park Hyatt Mendoza", tipo: "PDF" },
      { nombre: "Recomendaciones y seguros", tipo: "PDF" },
    ],
    estado: "Próximo",
  },
];

export type Lead = {
  id: string; nombre: string; telefono: string; email: string;
  categoria: string; disciplina: Discipline; fecha: string;
  estado: "Nuevo" | "Contactado" | "Pendiente" | "Inscrito" | "Descartado";
  notas: string; origen: "Asistente IA" | "Landing" | "Referido" | "Instagram";
  conversacionId?: string;
};

export const leads: Lead[] = [
  { id: "l1", nombre: "Camila Rojas (mamá)", telefono: "+56 9 8123 4455", email: "camila.rojas@correo.cl", categoria: "U13", disciplina: "volleyball", fecha: "2026-07-22", estado: "Nuevo", notas: "Hija de 12 años, viene de otro club. Preguntó horarios y valor.", origen: "Asistente IA", conversacionId: "cv-lead-1" },
  { id: "l2", nombre: "Ignacio Fuentes", telefono: "+56 9 7654 3210", email: "ifuentes@correo.cl", categoria: "U15", disciplina: "basketball", fecha: "2026-07-22", estado: "Contactado", notas: "Papá interesado. Solicitó ficha médica.", origen: "Asistente IA", conversacionId: "cv-lead-2" },
  { id: "l3", nombre: "Familia Torres", telefono: "+56 9 8888 1122", email: "torres.familia@correo.cl", categoria: "U10", disciplina: "basketball", fecha: "2026-07-21", estado: "Pendiente", notas: "Dos hijos. Esperando confirmación de disponibilidad de cupo.", origen: "Asistente IA" },
  { id: "l4", nombre: "Josefa Vega", telefono: "+56 9 8000 7766", email: "josefa.vega@correo.cl", categoria: "U17", disciplina: "volleyball", fecha: "2026-07-20", estado: "Inscrito", notas: "Inscrita el 21/07. Pago realizado por Webpay.", origen: "Landing" },
  { id: "l5", nombre: "Renato Silva", telefono: "+56 9 8500 3344", email: "rsilva@correo.cl", categoria: "Adulto", disciplina: "basketball", fecha: "2026-07-19", estado: "Descartado", notas: "Se cambió a otra ciudad.", origen: "Instagram" },
  { id: "l6", nombre: "Antonella Herrera", telefono: "+56 9 8720 6655", email: "aherrera@correo.cl", categoria: "U12", disciplina: "volleyball", fecha: "2026-07-19", estado: "Contactado", notas: "Enviada información por WhatsApp.", origen: "Asistente IA" },
  { id: "l7", nombre: "Bárbara Núñez", telefono: "+56 9 8611 2233", email: "bnunez@correo.cl", categoria: "U13", disciplina: "basketball", fecha: "2026-07-18", estado: "Inscrito", notas: "Inscrita luego de visita al club.", origen: "Referido" },
  { id: "l8", nombre: "Matías Contreras", telefono: "+56 9 8422 9911", email: "mcontreras@correo.cl", categoria: "U15", disciplina: "basketball", fecha: "2026-07-17", estado: "Nuevo", notas: "Preguntó por prueba masiva del 27/07.", origen: "Asistente IA", conversacionId: "cv-lead-3" },
];

export const iaAnalytics = {
  hoy: { conversaciones: 42, usuariosUnicos: 31, tiempoAhorrado: "3.5 h", tasaResolucion: 96 },
  semana: { conversaciones: 214, usuariosUnicos: 158, tiempoAhorrado: "22 h", tasaResolucion: 94 },
  mes: { conversaciones: 862, usuariosUnicos: 512, tiempoAhorrado: "94 h", tasaResolucion: 93 },
  evolucion: [
    { dia: "Lun", n: 28 }, { dia: "Mar", n: 34 }, { dia: "Mié", n: 42 },
    { dia: "Jue", n: 39 }, { dia: "Vie", n: 45 }, { dia: "Sáb", n: 18 }, { dia: "Dom", n: 8 },
  ],
  preguntasFrecuentes: [
    { pregunta: "¿Cuáles son los horarios de entrenamiento?", veces: 128, tendencia: "+12%" },
    { pregunta: "¿Cuánto cuesta la mensualidad?", veces: 96, tendencia: "+4%" },
    { pregunta: "¿Cómo inscribo a mi hijo?", veces: 74, tendencia: "+18%" },
    { pregunta: "¿Ya llegó el uniforme?", veces: 63, tendencia: "-6%" },
    { pregunta: "¿Cuándo son las próximas pruebas masivas?", veces: 51, tendencia: "+22%" },
    { pregunta: "¿Dónde está el reglamento?", veces: 34, tendencia: "-2%" },
  ],
  temas: [
    { tema: "Horarios", pct: 28 },
    { tema: "Pagos", pct: 22 },
    { tema: "Inscripción", pct: 18 },
    { tema: "Uniformes", pct: 14 },
    { tema: "Torneos y viajes", pct: 10 },
    { tema: "Documentos", pct: 8 },
  ],
  insights: [
    "Detecté que las **preguntas sobre horarios crecieron 12%** esta semana. Sugiero publicarlos en el pie de página del sitio.",
    "**18 apoderados diferentes** preguntaron cómo pagar por transferencia. Considera crear un instructivo público.",
    "Sobre **Copa Chicureo 2026** hay **7 apoderados** pidiendo el itinerario oficial. Puedo enviarlo automáticamente al confirmarse.",
    "Baja **6%** en consultas sobre uniformes tras publicar el estado en la ficha del jugador.",
  ],
};
