#!/usr/bin/env bash
# Prepara el entorno de desarrollo local: instala graphify aislado, activa los hooks
# de git del repo y genera el grafo del código. Idempotente: se puede correr de nuevo.
#
# graphify se instala en ${XDG_DATA_HOME:-~/.local/share}/club-colina-graphify/<versión>/,
# fuera del repo y sin tocar ninguna instalación global. La versión sale de
# .graphify-version. Solo extracción por AST: ningún contenido va a un modelo.
set -euo pipefail

cd "$(dirname "$0")/.."
# En la nube el hook de inicio de sesión ya arma el grafo, y correr esto en paralelo lo
# pisaría.
if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  echo "En la nube el grafo lo arma el hook de inicio de sesión; no corras este script."
  exit 0
fi
if [ "$(git rev-parse --show-toplevel 2>/dev/null)" != "$(pwd -P)" ] || [ ! -f .graphify-version ]; then
  echo "Error: corre este script desde la raíz de un clon de Club Colina." >&2
  exit 1
fi

# La lib valida .graphify-version (X.Y.Z): una versión vacía o con basura no instala nada.
# Todo lo que corre el binario de graphify pasa por graphify_exec (entorno mínimo, lista blanca).
# El log de los hooks lo recorta graphify_rebuild; este script ya no lo toca.
# shellcheck source=../.githooks/lib-graphify.sh
. .githooks/lib-graphify.sh
VERSION="$(graphify_version "$PWD")" || { echo "Error: .graphify-version debe contener solo una versión X.Y.Z." >&2; exit 1; }
# Con XDG_DATA_HOME relativa o sin HOME, la instalación caería en una ruta relativa al
# directorio de trabajo: se aborta sin instalar nada.
if ! DATA="$(graphify_data_home)"; then
  if [ -n "${XDG_DATA_HOME:-}" ]; then
    echo "Error: XDG_DATA_HOME no es una ruta absoluta. Corrígela (o quítala) y vuelve a correr el script; no se instaló nada." >&2
  else
    echo "Error: HOME está vacío o no es una ruta absoluta, y XDG_DATA_HOME no está definida. Corrígelo y vuelve a correr el script; no se instaló nada." >&2
  fi
  exit 1
fi
DIR="$DATA/club-colina-graphify/$VERSION"
# GRAPHIFY_BIN solo cuenta junto con GRAPHIFY_ALLOW_TEST_BIN=1 (las pruebas); si no, se ignora.
if graphify_test_bin; then BIN="$GRAPHIFY_BIN"; else BIN="$DIR/bin/graphify"; fi

echo "→ graphify $VERSION"
if ! graphify_test_bin; then
  if graphify_version_ok "$BIN" "$VERSION"; then
    echo "  ya instalado en $DIR"
  else
    if ! command -v uv >/dev/null 2>&1; then
      echo "Error: falta uv. Instálalo con «brew install uv» o desde https://docs.astral.sh/uv/ y vuelve a correr el script." >&2
      exit 1
    fi
    echo "  instalando en $DIR (uv usa o descarga un Python 3.10 o superior)"
    # Con lock: dos setup-dev a la vez (dos worktrees de Conductor) no se pisan.
    # Sin límite de tiempo para uv mismo: macOS no trae `timeout`.
    graphify_install "$VERSION" "$DIR" || { echo "Error: no se pudo instalar graphify $VERSION en $DIR." >&2; exit 1; }
  fi
fi
[ -x "$BIN" ] || { echo "Error: no existe el binario $BIN" >&2; exit 1; }

echo "→ avisos (informativos; no se borra nada)"
# No `--git-path hooks`: con core.hooksPath ya fijado devuelve .githooks, no el .git/hooks real.
HOOKS_DIR="$(git rev-parse --git-common-dir)/hooks"
for h in "$HOOKS_DIR"/*; do
  [ -f "$h" ] || continue
  case "$h" in *.sample) continue ;; esac
  if grep -qi graphify "$h" 2>/dev/null; then
    echo "  · $h es un hook de graphify de otra instalación. Con core.hooksPath ya no corre en este repo; si no lo necesitas, bórralo a mano."
  else
    echo "  · $h ya no correrá en este repo: core.hooksPath apunta a .githooks. Si lo necesitas, pásalo a .githooks."
  fi
done
if git config --get-regexp '^merge\.graphify' >/dev/null 2>&1; then
  echo "  · Hay un merge driver «merge.graphify» en la configuración de este repo (de «graphify hook install»). Quítalo con: git config --remove-section merge.graphify"
fi
if [ -f "$HOME/.graphify/providers.json" ]; then
  echo "  · Tienes proveedores de modelos propios en ~/.graphify/providers.json. Sus claves tienen nombres que Club Colina no conoce y no puede quitar del entorno; solo importarían si fallara la lista blanca de scripts/graphify (con --code-only no hay archivos para un modelo). No se borra nada."
fi
if [ -d "$HOME/.claude/skills/graphify" ]; then
  echo "  · Tienes el skill /graphify en ~/.claude/skills. Club Colina no lo usa, y su .claude/settings.json lo deniega aquí."
fi
echo "  Una instalación global de graphify no molesta: Club Colina usa solo la suya, aislada."

echo "→ generando el grafo (solo AST)"
graphify_exec_filtered "$BIN" extract . --code-only
graphify_exec_filtered "$BIN" update .

# Después del grafo: con los hooks ya activos, un commit durante la construcción
# lanzaría un segundo `update` encima.
echo "→ hooks de git del repo"
git config core.hooksPath .githooks

echo
echo "Listo."
echo "  graphify:       $(graphify_exec "$BIN" --version) ($BIN)"
echo "  log de hooks:   $(graphify_log "$PWD")"
echo "  core.hooksPath: $(git config --get core.hooksPath)"
echo "  grafo:          $PWD/graphify-out/graph.json"
