// Genera el logo transparente, los íconos y la og-image desde el original del club, que vive en
// frontend/src/assets/fuente/ y nunca se modifica ni se redibuja. Nada lo importa: no entra al
// build, solo lo lee este script.
//
//   pnpm --filter @club-colina/frontend generar:iconos
//
// Escribe en frontend/public/. Los archivos generados se comitean: el build no corre este script.
//
// Hoy el original es un JPG de 270x148 (por eso la og-image y el icon-512 se ven algo blandos).
// Cuando llegue un PNG grande o un SVG: guardarlo en esa carpeta como logo-colina.png o
// logo-colina.svg, borrar el JPG y correr el comando. Si trae transparencia, se pinta sobre FONDO
// antes de procesar. Después revisar a ojo el favicon (RECORTE_C se escala al ancho del original,
// así que vale solo si el dibujo tiene la misma composición) y FONDO si el fondo cambió.
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const CARPETA_FUENTE = path.join(RAIZ, "frontend", "src", "assets", "fuente");
const NOMBRES_FUENTE = ["logo-colina.svg", "logo-colina.png", "logo-colina.jpg"];
const PUBLICO = path.join(RAIZ, "frontend", "public");

// Fondo sólido del JPG (medido en las cuatro esquinas y en todo el borde: #2A2D36).
const FONDO = { r: 42, g: 45, b: 54 };
// Colores del panel (src/styles.css): --sidebar y --background, pasados de oklch a hex.
const COLOR_TEMA = "#0f1e3b";
const COLOR_FONDO_APP = "#f8fafd";

// Para quitar el fondo: bajo RUIDO se considera fondo (artefactos del JPEG); desde OPACO, logo
// puro. En medio, borde suavizado: se recupera su transparencia y su color sin el fondo.
const RUIDO = 10;
const OPACO = 140;

/** La "C" de COLINA, para los íconos chicos (medida en el original de 270x148). */
const ANCHO_MEDIDO = 270;
const RECORTE_C = { left: 15, top: 31, width: 54, height: 88 };
/** Alto máximo de los logos que usa la interfaz (4 veces lo que se muestra, para pantallas retina). */
const ALTO_MAX_LOGO = 160;

/** El único original de la carpeta, en RGB sobre FONDO (un SVG se rasteriza a buen tamaño). */
async function cargarOriginal() {
  const encontrados = [];
  for (const nombre of NOMBRES_FUENTE) {
    const ruta = path.join(CARPETA_FUENTE, nombre);
    try {
      await access(ruta);
      encontrados.push(ruta);
    } catch {
      // No está: se prueba el siguiente.
    }
  }
  if (encontrados.length !== 1) {
    throw new Error(
      `Tiene que haber exactamente un original en ${CARPETA_FUENTE} (${NOMBRES_FUENTE.join(", ")}); hay ${encontrados.length}.`,
    );
  }
  const [ruta] = encontrados;
  const entrada = ruta.endsWith(".svg") ? sharp(ruta, { density: 600 }) : sharp(ruta);
  return sharp(await entrada.flatten({ background: FONDO }).removeAlpha().png().toBuffer());
}

async function pixeles(imagen) {
  const { data, info } = await imagen.clone().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error("Se esperaba una imagen RGB");
  return { data, ancho: info.width, alto: info.height };
}

/** RGBA con el fondo convertido en transparencia (el "color a alfa" de los editores). */
function quitarFondo({ data, ancho, alto }) {
  const fondo = [FONDO.r, FONDO.g, FONDO.b];
  const salida = Buffer.alloc(ancho * alto * 4);
  for (let i = 0; i < ancho * alto; i++) {
    const p = [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
    const distancia = Math.max(...p.map((v, c) => Math.abs(v - fondo[c])));
    const alfa = Math.min(1, Math.max(0, (distancia - RUIDO) / (OPACO - RUIDO)));
    for (let c = 0; c < 3; c++) {
      const color = alfa > 0 ? fondo[c] + (p[c] - fondo[c]) / alfa : 0;
      salida[i * 4 + c] = Math.round(Math.min(255, Math.max(0, color)));
    }
    salida[i * 4 + 3] = Math.round(alfa * 255);
  }
  return sharp(salida, { raw: { width: ancho, height: alto, channels: 4 } });
}

/** El logo (o un recorte) centrado en un lienzo del color del fondo del JPG. */
async function sobreFondo(origen, ancho, alto, ocupacion) {
  const { width, height } = await origen.clone().metadata();
  const escala = Math.min((ancho * ocupacion) / width, (alto * ocupacion) / height);
  const logo = await origen
    .clone()
    .resize(Math.round(width * escala), Math.round(height * escala), { kernel: "lanczos3" })
    .png()
    .toBuffer();
  const lienzo = await sharp({
    create: { width: ancho, height: alto, channels: 3, background: FONDO },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toBuffer();
  // Sin canal alfa: los íconos llevan fondo sólido (iOS pinta de negro lo transparente).
  return sharp(lienzo).removeAlpha().png();
}

/** .ico con PNG adentro (válido desde Windows Vista y en todos los navegadores). */
function armarIco(pngs) {
  const cabecera = Buffer.alloc(6 + 16 * pngs.length);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(pngs.length, 4);
  let desplazamiento = cabecera.length;
  pngs.forEach(({ lado, png }, i) => {
    const e = 6 + 16 * i;
    cabecera.writeUInt8(lado >= 256 ? 0 : lado, e);
    cabecera.writeUInt8(lado >= 256 ? 0 : lado, e + 1);
    cabecera.writeUInt8(0, e + 2);
    cabecera.writeUInt8(0, e + 3);
    cabecera.writeUInt16LE(1, e + 4);
    cabecera.writeUInt16LE(32, e + 6);
    cabecera.writeUInt32LE(png.length, e + 8);
    cabecera.writeUInt32LE(desplazamiento, e + 12);
    desplazamiento += png.length;
  });
  return Buffer.concat([cabecera, ...pngs.map((p) => p.png)]);
}

async function main() {
  await mkdir(PUBLICO, { recursive: true });
  const original = await cargarOriginal();
  const { width: anchoOriginal } = await original.metadata();
  const escribir = (nombre, datos) => writeFile(path.join(PUBLICO, nombre), datos);
  const achicar = { height: ALTO_MAX_LOGO, withoutEnlargement: true, kernel: "lanczos3" };

  // Logo transparente para los encabezados oscuros, recortado al dibujo.
  const transparente = await quitarFondo(await pixeles(original))
    .png()
    .toBuffer();
  const recortado = await sharp(transparente).trim({ threshold: 0 }).png().toBuffer();
  await escribir("logo-colina.png", await sharp(recortado).resize(achicar).png().toBuffer());
  // El logo con su fondo, para fondos claros (login).
  await escribir("logo-colina-fondo.png", await original.clone().resize(achicar).png().toBuffer());

  // El JPG tiene más margen arriba que abajo: para centrar se recorta el margen de fondo (solo
  // margen; el dibujo queda intacto).
  const sinMargen = sharp(
    await original
      .clone()
      .trim({ background: FONDO, threshold: RUIDO * 2 })
      .png()
      .toBuffer(),
  );

  // Íconos de la pantalla de inicio: el logo entero sobre su fondo.
  for (const [nombre, lado] of [
    ["apple-touch-icon.png", 180],
    ["icon-192.png", 192],
    ["icon-512.png", 512],
  ]) {
    await escribir(nombre, await (await sobreFondo(sinMargen, lado, lado, 0.8)).toBuffer());
  }

  // Favicon: a 16 px el logo entero no se lee; va la "C" de COLINA recortada del original.
  const f = anchoOriginal / ANCHO_MEDIDO;
  const recorte = Object.fromEntries(
    Object.entries(RECORTE_C).map(([k, v]) => [k, Math.round(v * f)]),
  );
  const recorteC = sharp(await original.clone().extract(recorte).png().toBuffer());
  const pngs = [];
  for (const lado of [16, 32, 48]) {
    const icono = await (await sobreFondo(recorteC, lado, lado, 0.92)).toBuffer();
    pngs.push({ lado, png: await sharp(icono).ensureAlpha().png().toBuffer() });
  }
  await escribir("favicon.ico", armarIco(pngs));

  // Imagen al compartir el link (WhatsApp y otros): 1200x630, el logo centrado sobre su fondo.
  await escribir("og-image.png", await (await sobreFondo(sinMargen, 1200, 630, 0.5)).toBuffer());

  const manifiesto = {
    name: "Club Colina",
    short_name: "Colina",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    theme_color: COLOR_TEMA,
    background_color: COLOR_FONDO_APP,
    display: "standalone",
    start_url: "/",
  };
  await escribir("site.webmanifest", JSON.stringify(manifiesto, null, 2) + "\n");
}

await main();
