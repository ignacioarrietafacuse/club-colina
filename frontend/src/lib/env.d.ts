/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Ver `src/lib/base-publica.ts`. La fija `vite.config.ts`; nunca falta en un build. */
  readonly VITE_PUBLIC_BASE_URL: string;
}
