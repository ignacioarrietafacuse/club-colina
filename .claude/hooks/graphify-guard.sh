#!/bin/sh
# PreToolUse: recuerda al agente consultar el grafo antes de buscar o leer archivos.
# Recibe `search` o `read`. Corre en cada Bash, Grep, Read y Glob, así que no instala
# nada, no construye nada y nunca bloquea ni falla: sin binario o sin grafo, calla.
# Usa la instalación aislada de Club Colina (ver .githooks/lib-graphify.sh), no la del PATH,
# y la corre con graphify_exec (entorno mínimo).
trap 'exit 0' EXIT

root="${CLAUDE_PROJECT_DIR:-}"
[ -n "$root" ] || root=$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)

# La versión y la ruta del binario salen de la lib común (valida .graphify-version).
lib="$root/.githooks/lib-graphify.sh"
if [ ! -r "$lib" ]; then
  cat > /dev/null
  exit 0
fi
. "$lib"
bin=$(graphify_bin "$root") || bin=""

if [ -z "$bin" ] || [ ! -x "$bin" ] || [ ! -f "$root/graphify-out/graph.json" ]; then
  cat > /dev/null
  exit 0
fi

cd "$root" 2>/dev/null
# Sin exec: así ningún código de salida de graphify llega a Claude Code como bloqueo.
# El aviso de graphify manda a correr `graphify query|explain|path`, y ese comando es el del
# PATH (otra versión, sin las variables de arriba): se reescribe a scripts/graphify aquí,
# porque el aviso también se copia al prompt de cada subagente y ahí no llega CLAUDE.md.
graphify_exec "$bin" hook-guard "$1" 2>/dev/null | sed 's/`graphify /`scripts\/graphify /g'
exit 0
