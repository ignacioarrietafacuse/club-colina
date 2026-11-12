import type { FamiliaResponse } from "@club-colina/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VistaCredencial } from "./Credencial";
import { VistaFamilia } from "./Familia";
import { Listo, Registro } from "./registro/Registro";

// Datos siempre ficticios.
const TOKEN = "T".repeat(43);
const html = (n: ReactNode) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{n}</QueryClientProvider>);

describe("credencial", () => {
  it("válida: foto por el backend, nombre, rol y hora; no es verde hasta que carga la foto", () => {
    const h = html(
      <VistaCredencial
        estado={{
          tipo: "valida",
          datos: { nombre_completo: "Ana Pérez Soto", rol: "apoderado" },
          fotoUrl: `/api/public/credencial/${TOKEN}/foto`,
          verificadaEn: new Date("2026-11-12T15:04:05Z"),
        }}
      />,
    );
    expect(h).toContain("Ana Pérez Soto");
    expect(h).toContain("Apoderado");
    expect(h).toContain(`src="/api/public/credencial/${TOKEN}/foto"`);
    expect(h).toContain("Verificado a las");
    expect(h).toContain("Cargando foto");
    expect(h).not.toContain("Credencial válida");
  });

  it("no válida y error nunca dicen «válida» en verde", () => {
    const noValida = html(<VistaCredencial estado={{ tipo: "no_valida" }} />);
    expect(noValida).toContain("Credencial no válida");
    expect(noValida).not.toContain("Credencial válida");
    for (const tipo of ["error", "cargando", "vencida", "demasiados_intentos"] as const) {
      const h = html(<VistaCredencial estado={{ tipo }} />);
      expect(h).not.toMatch(/Credencial válida/);
      expect(h).not.toContain("<img");
    }
  });
});

describe("familia", () => {
  const datos: FamiliaResponse = {
    estado_solicitud: "pendiente",
    personas: [
      { nombre_completo: "Ana Pérez", rol: "apoderado", estado: "activo", credencial_token: TOKEN },
      { nombre_completo: "Beto Pérez", rol: "jugador", estado: "pendiente" },
      { nombre_completo: "Caro Pérez", rol: "jugador", estado: "rechazado" },
    ],
    otros_apoderados: [{ nombre_completo: "Eva Soto", foto_subida: false }],
  };

  it("muestra a cada persona con su estado y el QR solo de las activas", () => {
    const h = html(<VistaFamilia datos={datos} baseUrl="https://club.example" />);
    expect(h).toContain("Ana Pérez");
    expect(h).toContain("Pendiente de aprobación");
    expect(h).toContain("No aprobada");
    expect(h).toContain("Algunas personas siguen en revisión");
    expect(h).toContain("Eva Soto");
    expect(h).toContain("Falta que suba su foto");
    // El QR se dibuja en el navegador; en el HTML inicial hay un solo espacio reservado.
    expect(h.match(/animate-pulse/g)).toHaveLength(1);
  });

  it("lista vacía en revisión: no invita a mostrar QR que no existen", () => {
    const h = html(
      <VistaFamilia
        datos={{ estado_solicitud: "pendiente", personas: [], otros_apoderados: [] }}
        baseUrl="https://club.example"
      />,
    );
    expect(h).toContain("El club está revisando tu registro");
    expect(h).not.toContain("Muestra el código QR");
  });

  it("revisada sin nadie activo: lo dice", () => {
    const h = html(
      <VistaFamilia
        datos={{
          estado_solicitud: "revisada",
          personas: [{ nombre_completo: "Beto Pérez", rol: "jugador", estado: "rechazado" }],
          otros_apoderados: [],
        }}
        baseUrl="https://club.example"
      />,
    );
    expect(h).toContain("No hay credenciales activas");
    expect(h).not.toContain("Muestra el código QR");
  });

  it("todo aprobado: invita a mostrar el QR", () => {
    const h = html(
      <VistaFamilia
        datos={{
          estado_solicitud: "revisada",
          personas: datos.personas.slice(0, 1),
          otros_apoderados: [],
        }}
        baseUrl="https://club.example"
      />,
    );
    expect(h).toContain("Muestra el código QR");
    expect(h).not.toContain("Otros apoderados");
  });
});

describe("registro", () => {
  it("parte pidiendo el RUT de quien llena", () => {
    const h = html(<Registro baseUrl="https://club.example" />);
    expect(h).toContain("Tu RUT");
    expect(h).toContain("no el de tu hijo");
  });

  it("al terminar muestra el link privado y los de los otros apoderados", () => {
    const otro = "O".repeat(43);
    const h = html(
      <Listo
        baseUrl="https://club.example/"
        resultado={{
          token_acceso: TOKEN,
          otros_apoderados: [{ nombre_completo: "Eva Soto", completar_token: otro }],
        }}
      />,
    );
    expect(h).toContain(`https://club.example/familia/${TOKEN}`);
    expect(h).toContain(`https://club.example/completar/${otro}`);
    expect(h).toContain("Es la única vez que lo verás");
  });
});
