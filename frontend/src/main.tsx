import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { crearRouter } from "./router";
// Poppins servida desde el propio sitio: las familias no cargan nada de Google.
import "@fontsource/poppins/300.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "./styles.css";

const queryClient = new QueryClient();
const router = crearRouter(queryClient);

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Falta el elemento #root");

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
