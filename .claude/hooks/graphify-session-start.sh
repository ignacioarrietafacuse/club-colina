#!/bin/sh
# SessionStart (solo en la nube): deja listo el grafo del código en segundo plano.
# Lo que un SessionStart imprime entra al contexto de Claude, así que no imprime nada:
# todo va al log del repo (graphify_log en la lib). Cualquier falla se anota ahí y termina en 0.
# Solo AST (`extract --code-only` y `update`), sin LLM. Sin la lib no se puede ni calcular
# la ruta del log: en ese caso sale en silencio (sin la lib tampoco hay graphify que armar).
trap 'exit 0' EXIT
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0

# La raíz sale de la ubicación del script (<repo>/.claude/hooks/): en una sesión con varios
# repositorios CLAUDE_PROJECT_DIR apunta a la carpeta que los contiene, no a este repo.
root=$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd) || root=""
[ -r "$root/.githooks/lib-graphify.sh" ] || root="${CLAUDE_PROJECT_DIR:-}"
lib="$root/.githooks/lib-graphify.sh"
[ -r "$lib" ] || exit 0
# Marca de que el arranque ya se lanzó en esta copia (ver el bloque de graphify en CLAUDE.md):
# si falta, el agente sabe que el hook no corrió y lo lanza él. Va dentro de la carpeta de git,
# nunca en el árbol de trabajo.
marca=$(git -C "$root" rev-parse --git-path graphify-sesion 2>/dev/null) || marca=""
case "$marca" in "") ;; /*) date > "$marca" 2>/dev/null ;; *) date > "$root/$marca" 2>/dev/null ;; esac
. "$lib"
LOG=$(graphify_log "$root") || exit 0
graphify_log_init "$LOG" || exit 0
graphify_log_trim "$LOG"

# Construye o actualiza el grafo. Cada falla se anota y vuelve; quien llama sigue.
build() {
  [ -n "$bin" ] || { echo ".graphify-version falta o no es X.Y.Z, o XDG_DATA_HOME es relativa o HOME está vacío: no se instala nada"; return 1; }
  if ! graphify_test_bin; then
    ver=$(graphify_version "$root")
    data=$(graphify_data_home) || { echo "XDG_DATA_HOME relativa o HOME vacío: no se instala nada"; return 1; }
    dir="$data/club-colina-graphify/$ver"
    if ! graphify_version_ok "$bin" "$ver"; then
      echo "instalando graphifyy==$ver en $dir"
      # Con lock: dos sesiones a la vez no se pisan. Sin límite de tiempo para uv mismo
      # (macOS no trae `timeout`).
      graphify_install "$ver" "$dir" || { echo "falló la instalación"; return 1; }
    fi
  fi
  [ -x "$bin" ] || { echo "no hay binario: $bin"; return 1; }

  if [ ! -f graphify-out/graph.json ]; then
    graphify_exec_filtered "$bin" extract . --code-only && graphify_exec_filtered "$bin" update . || { echo "falló la construcción del grafo"; return 1; }
  else
    graphify_exec_filtered "$bin" update . || { echo "falló la actualización del grafo"; return 1; }
  fi
}

{
  cd "$root" 2>/dev/null || { echo "=== $(date) bin=? cwd=$root SessionStart nube: sin directorio del proyecto"; echo "=== fin rc=1 cwd=$root"; exit 0; }
  bin=$(graphify_bin "$root") || bin=""
  echo "=== $(date) bin=${bin:-?} cwd=$(pwd) SessionStart nube"
  build
  rc=$?
  # Después del grafo, no antes: con core.hooksPath ya fijado, un commit o checkout de la
  # sesión mientras se construye lanzaría un segundo `update` encima. Si la construcción
  # falló, igual se fija: los hooks ya avisan bien cuando no hay grafo.
  git config core.hooksPath .githooks || echo "no se pudo fijar core.hooksPath"
  echo "=== fin rc=$rc cwd=$(pwd)"
} >> "$LOG" 2>&1
exit 0
