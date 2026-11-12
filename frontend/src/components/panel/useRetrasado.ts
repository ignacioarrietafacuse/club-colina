import { useEffect, useState } from "react";

/** Espera a que se deje de escribir para no pedir la lista en cada tecla. */
export function useRetrasado<T>(valor: T, ms = 300): T {
  const [retrasado, setRetrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retrasado;
}
